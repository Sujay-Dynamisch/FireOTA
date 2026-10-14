-- Re-publishing (e.g. resuming) a release that is already the channel target must not
-- record it as its own rollback target, and rollback must skip such self references.
CREATE OR REPLACE FUNCTION public.fireota_previous_target(_release_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT previous_release_id FROM public.deployments
  WHERE release_id = _release_id AND type = 'publish'
    AND previous_release_id IS NOT NULL AND previous_release_id <> _release_id
  ORDER BY created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.fireota_previous_target(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fireota_previous_target(uuid) TO service_role;

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
  VALUES (_org, r.app_id, ch.id, r.id,
    CASE WHEN prev = r.id THEN public.fireota_previous_target(r.id) ELSE prev END,
    'publish', 'completed', _source, _actor, _actor_label);

  RETURN jsonb_build_object('previous_release_id', prev, 'channel_id', ch.id, 'channel_name', ch.name);
END; $$;


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
    target := public.fireota_previous_target(r.id);
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

