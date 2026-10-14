REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.org_role_of(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;

CREATE POLICY "server only" ON public.firebase_connections FOR SELECT TO authenticated USING (false);
CREATE POLICY "server only" ON public.oauth_states FOR SELECT TO authenticated USING (false);
CREATE POLICY "server only" ON public.api_keys FOR SELECT TO authenticated USING (false);
CREATE POLICY "server only" ON public.webhooks FOR SELECT TO authenticated USING (false);