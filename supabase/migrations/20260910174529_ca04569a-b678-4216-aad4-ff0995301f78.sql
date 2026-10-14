
CREATE TABLE public.rate_limit_hits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_hits_bucket_idx ON public.rate_limit_hits (bucket, created_at DESC);
GRANT ALL ON public.rate_limit_hits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_hits_id_seq TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limit_hits server only" ON public.rate_limit_hits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.rate_limit_hit(_bucket text, _since timestamptz, _limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used integer;
BEGIN
  DELETE FROM public.rate_limit_hits WHERE created_at < now() - interval '1 day';
  INSERT INTO public.rate_limit_hits (bucket) VALUES (_bucket);
  SELECT count(*) INTO used FROM public.rate_limit_hits WHERE bucket = _bucket AND created_at >= _since;
  RETURN _limit - used;
END;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, timestamptz, integer) TO service_role;

CREATE TABLE public.device_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  installation_id text NOT NULL,
  platform platform_type NOT NULL,
  app_version text NOT NULL DEFAULT '',
  runtime_version text NOT NULL DEFAULT '',
  native_version text NOT NULL DEFAULT '',
  current_release_id uuid REFERENCES public.releases(id) ON DELETE SET NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, installation_id)
);
CREATE INDEX device_installations_app_idx ON public.device_installations (app_id, last_seen_at DESC);
CREATE INDEX device_installations_channel_idx ON public.device_installations (channel_id);
GRANT ALL ON public.device_installations TO service_role;
ALTER TABLE public.device_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_installations server only" ON public.device_installations FOR ALL TO service_role USING (true) WITH CHECK (true);
