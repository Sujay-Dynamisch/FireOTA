-- ============ PER-PLATFORM CHANNEL TARGETS ============
-- A channel is platform-neutral, but releases are per platform. Each (channel, platform)
-- pair has its own authoritative active release so Android and iOS never overwrite each other.
-- channels.active_release_id remains as "most recently published" for display only.
CREATE TABLE public.channel_targets (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  platform public.platform_type NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  release_id uuid REFERENCES public.releases(id) ON DELETE SET NULL,
  rollout_percentage integer NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, platform)
);
CREATE INDEX idx_channel_targets_release ON public.channel_targets(release_id);
GRANT SELECT ON public.channel_targets TO authenticated;
GRANT ALL ON public.channel_targets TO service_role;
ALTER TABLE public.channel_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel targets member read" ON public.channel_targets FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

INSERT INTO public.channel_targets (channel_id, platform, organization_id, app_id, release_id, rollout_percentage)
SELECT c.id, r.platform, c.organization_id, c.app_id, r.id, c.rollout_percentage
FROM public.channels c JOIN public.releases r ON r.id = c.active_release_id
ON CONFLICT DO NOTHING;

ALTER TABLE public.releases
  ADD CONSTRAINT releases_rollout_range CHECK (rollout_percentage BETWEEN 0 AND 100);
ALTER TABLE public.channels
  ADD CONSTRAINT channels_rollout_range CHECK (rollout_percentage BETWEEN 0 AND 100);

-- ============ ANALYTICS IDEMPOTENCY ============
ALTER TABLE public.analytics_events ADD COLUMN event_id text;
CREATE UNIQUE INDEX idx_analytics_event_id ON public.analytics_events(app_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_analytics_release_type ON public.analytics_events(release_id, event_type);

-- ============ WEBHOOK RETRY QUEUE ============
-- Each row is one attempt. A failed attempt carries next_attempt_at until a worker claims it;
-- dead = true once attempts are exhausted (dead letter).
ALTER TABLE public.webhook_deliveries
  ADD COLUMN delivery_id uuid,
  ADD COLUMN payload text,
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN dead boolean NOT NULL DEFAULT false;
CREATE INDEX idx_webhook_deliveries_retry ON public.webhook_deliveries(next_attempt_at) WHERE next_attempt_at IS NOT NULL;

-- ============ ATOMIC PUBLISH ============
-- Locks the release and its (channel, platform) target so two publishes cannot interleave.
CREATE OR REPLACE FUNCTION public.fireota_publish_release(
  _org uuid, _release_id uuid, _percentage integer,
  _actor uuid, _actor_label text, _source text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.releases;
  ch public.channels;
  prev uuid;
BEGIN
  IF _percentage < 0 OR _percentage > 100 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

  SELECT * INTO r FROM public.releases WHERE id = _release_id AND organization_id = _org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND'; END IF;
  IF r.status = 'published' THEN RAISE EXCEPTION 'RELEASE_ALREADY_PUBLISHED'; END IF;
  IF r.status NOT IN ('ready', 'paused', 'rolled_back') THEN RAISE EXCEPTION 'RELEASE_NOT_READY'; END IF;
  IF r.bundle_hash IS NULL OR r.storage_path IS NULL THEN RAISE EXCEPTION 'RELEASE_NOT_READY'; END IF;

  SELECT * INTO ch FROM public.channels WHERE id = r.channel_id AND organization_id = _org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CHANNEL'; END IF;

  INSERT INTO public.channel_targets (channel_id, platform, organization_id, app_id)
  VALUES (ch.id, r.platform, _org, r.app_id)
  ON CONFLICT (channel_id, platform) DO NOTHING;
  SELECT release_id INTO prev FROM public.channel_targets
  WHERE channel_id = ch.id AND platform = r.platform FOR UPDATE;

  IF prev IS NOT NULL AND prev <> r.id THEN
    UPDATE public.releases SET status = 'archived' WHERE id = prev AND status IN ('published', 'paused');
    UPDATE public.rollouts SET status = 'completed', updated_at = now() WHERE release_id = prev AND status <> 'completed';
  END IF;

  UPDATE public.releases SET status = 'published', rollout_percentage = _percentage, published_at = now()
  WHERE id = r.id;
  UPDATE public.channel_targets SET release_id = r.id, rollout_percentage = _percentage, updated_at = now()
  WHERE channel_id = ch.id AND platform = r.platform;
  UPDATE public.channels SET active_release_id = r.id, rollout_percentage = _percentage, status = 'active'
  WHERE id = ch.id;

  INSERT INTO public.rollouts (organization_id, app_id, release_id, channel_id, current_percentage, target_percentage, status, started_at)
  VALUES (_org, r.app_id, r.id, ch.id, _percentage, 100, CASE WHEN _percentage >= 100 THEN 'completed' ELSE 'active' END, now())
  ON CONFLICT (release_id) DO UPDATE SET
    current_percentage = EXCLUDED.current_percentage,
    status = EXCLUDED.status,
    channel_id = EXCLUDED.channel_id,
    updated_at = now();

  INSERT INTO public.deployments (organization_id, app_id, channel_id, release_id, previous_release_id, type, status, source, created_by, created_by_label)
  VALUES (_org, r.app_id, ch.id, r.id, prev, 'publish', 'completed', _source, _actor, _actor_label);

  RETURN jsonb_build_object('previous_release_id', prev, 'channel_id', ch.id, 'channel_name', ch.name);
END; $$;

-- ============ ATOMIC ROLLBACK ============
-- Restores an explicit target, or the release this one replaced. The target must be a
-- verified, same-app/channel/platform/runtime release that was never deleted.
CREATE OR REPLACE FUNCTION public.fireota_rollback_release(
  _org uuid, _release_id uuid, _target_id uuid,
  _actor uuid, _actor_label text, _source text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.releases;
  t public.releases;
  target uuid := _target_id;
  active uuid;
BEGIN
  SELECT * INTO r FROM public.releases WHERE id = _release_id AND organization_id = _org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND'; END IF;
  IF r.status NOT IN ('published', 'paused') THEN RAISE EXCEPTION 'ROLLBACK_NOT_ALLOWED'; END IF;

  PERFORM 1 FROM public.channels WHERE id = r.channel_id FOR UPDATE;
  SELECT release_id INTO active FROM public.channel_targets
  WHERE channel_id = r.channel_id AND platform = r.platform FOR UPDATE;
  IF active IS DISTINCT FROM r.id THEN RAISE EXCEPTION 'ROLLBACK_NOT_ALLOWED'; END IF;

  IF target IS NULL THEN
    SELECT previous_release_id INTO target FROM public.deployments
    WHERE release_id = r.id AND type = 'publish' AND organization_id = _org
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF target IS NOT NULL THEN
    SELECT * INTO t FROM public.releases WHERE id = target AND organization_id = _org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ROLLBACK_NOT_ALLOWED'; END IF;
    IF t.id = r.id OR t.app_id <> r.app_id OR t.channel_id IS DISTINCT FROM r.channel_id OR t.platform <> r.platform THEN
      RAISE EXCEPTION 'ROLLBACK_NOT_ALLOWED';
    END IF;
    IF t.status NOT IN ('archived', 'rolled_back', 'ready', 'paused') THEN RAISE EXCEPTION 'ROLLBACK_NOT_ALLOWED'; END IF;
    IF t.bundle_hash IS NULL OR t.storage_path IS NULL THEN RAISE EXCEPTION 'RELEASE_NOT_READY'; END IF;
    IF t.runtime_version <> r.runtime_version THEN RAISE EXCEPTION 'INCOMPATIBLE_RUNTIME'; END IF;
  END IF;

  UPDATE public.releases SET status = 'rolled_back' WHERE id = r.id;
  UPDATE public.rollouts SET status = 'paused', updated_at = now() WHERE release_id = r.id;

  IF target IS NOT NULL THEN
    UPDATE public.releases SET status = 'published', published_at = now(), rollout_percentage = 100 WHERE id = target;
    UPDATE public.channel_targets SET release_id = target, rollout_percentage = 100, updated_at = now()
    WHERE channel_id = r.channel_id AND platform = r.platform;
    UPDATE public.channels SET active_release_id = target, rollout_percentage = 100, status = 'active'
    WHERE id = r.channel_id;
  ELSE
    UPDATE public.channel_targets SET release_id = NULL, updated_at = now()
    WHERE channel_id = r.channel_id AND platform = r.platform;
    UPDATE public.channels SET active_release_id = (
      SELECT release_id FROM public.channel_targets WHERE channel_id = r.channel_id AND release_id IS NOT NULL LIMIT 1
    ) WHERE id = r.channel_id;
  END IF;

  INSERT INTO public.deployments (organization_id, app_id, channel_id, release_id, previous_release_id, type, status, source, reason, created_by, created_by_label)
  VALUES (_org, r.app_id, r.channel_id, COALESCE(target, r.id), r.id, 'rollback', 'completed', _source, _reason, _actor, _actor_label);

  RETURN jsonb_build_object('restored_release_id', target);
END; $$;

REVOKE ALL ON FUNCTION public.fireota_publish_release(uuid, uuid, integer, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fireota_rollback_release(uuid, uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fireota_publish_release(uuid, uuid, integer, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fireota_rollback_release(uuid, uuid, uuid, uuid, text, text, text) TO service_role;

-- Supabase's helper is SECURITY DEFINER; it is only needed by its event trigger, never over the API.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
