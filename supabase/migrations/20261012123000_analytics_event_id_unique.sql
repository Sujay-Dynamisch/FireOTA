-- ON CONFLICT cannot target a partial index; NULL event ids never conflict in a plain unique index anyway.
DROP INDEX IF EXISTS public.idx_analytics_event_id;
CREATE UNIQUE INDEX idx_analytics_event_id ON public.analytics_events(app_id, event_id);
-- rate_limit_hit() prunes by created_at on every call; give it an index.
CREATE INDEX IF NOT EXISTS rate_limit_hits_created_idx ON public.rate_limit_hits (created_at);
