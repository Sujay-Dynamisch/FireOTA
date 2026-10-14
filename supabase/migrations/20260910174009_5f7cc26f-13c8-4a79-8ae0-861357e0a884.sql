-- ============ ENUMS ============
CREATE TYPE public.org_role AS ENUM ('owner','admin','release_manager','developer','viewer','agent');
CREATE TYPE public.platform_type AS ENUM ('android','ios');
CREATE TYPE public.release_status AS ENUM ('draft','uploading','processing','ready','published','paused','rolled_back','archived','failed','deleted');
CREATE TYPE public.connection_status AS ENUM ('connected','degraded','auth_expired','permission_error','disconnected');
CREATE TYPE public.permission_mode AS ENUM ('allowed','denied','requires_approval');
CREATE TYPE public.approval_status AS ENUM ('pending','approved','rejected','expired');

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  avatar_url text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles own read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles own write" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.email,''), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'UTC',
  default_channel text NOT NULL DEFAULT 'production',
  require_publish_confirmation boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  role public.org_role NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'active',
  invited_by uuid,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
GRANT SELECT ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER org_members_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org AND m.user_id = _user AND m.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.org_role_of(_org uuid, _user uuid)
RETURNS public.org_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role FROM public.organization_members m
  WHERE m.organization_id = _org AND m.user_id = _user AND m.status = 'active' LIMIT 1;
$$;

CREATE POLICY "orgs member read" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id, auth.uid()));
CREATE POLICY "org members read" ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- ============ FIREBASE ============
CREATE TABLE public.firebase_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_account text NOT NULL DEFAULT '',
  refresh_token_ciphertext text,
  scopes text[] NOT NULL DEFAULT '{}',
  status public.connection_status NOT NULL DEFAULT 'connected',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_conn_org ON public.firebase_connections(organization_id);
GRANT ALL ON public.firebase_connections TO service_role;
ALTER TABLE public.firebase_connections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER fb_conn_updated_at BEFORE UPDATE ON public.firebase_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.firebase_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  firebase_connection_id uuid REFERENCES public.firebase_connections(id) ON DELETE SET NULL,
  firebase_project_id text NOT NULL,
  project_number text,
  display_name text NOT NULL,
  storage_bucket text,
  firestore_enabled boolean NOT NULL DEFAULT false,
  storage_enabled boolean NOT NULL DEFAULT false,
  google_account text NOT NULL DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '[]',
  status public.connection_status NOT NULL DEFAULT 'connected',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, firebase_project_id)
);
CREATE INDEX idx_fb_proj_org ON public.firebase_projects(organization_id);
GRANT SELECT ON public.firebase_projects TO authenticated;
GRANT ALL ON public.firebase_projects TO service_role;
ALTER TABLE public.firebase_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fb projects member read" ON public.firebase_projects FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER fb_proj_updated_at BEFORE UPDATE ON public.firebase_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.oauth_states (
  state text PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  code_verifier text NOT NULL,
  redirect_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- ============ APPS ============
CREATE TABLE public.apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  firebase_project_id uuid REFERENCES public.firebase_projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'setup',
  runtime_version text NOT NULL DEFAULT '1.0.0',
  default_channel text NOT NULL DEFAULT 'production',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX idx_apps_org ON public.apps(organization_id);
GRANT SELECT ON public.apps TO authenticated;
GRANT ALL ON public.apps TO service_role;
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apps member read" ON public.apps FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER apps_updated_at BEFORE UPDATE ON public.apps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.app_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform public.platform_type NOT NULL,
  package_name text,
  bundle_identifier text,
  native_version text NOT NULL DEFAULT '1.0.0',
  runtime_version text NOT NULL DEFAULT '1.0.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, platform)
);
CREATE INDEX idx_app_platforms_app ON public.app_platforms(app_id);
GRANT SELECT ON public.app_platforms TO authenticated;
GRANT ALL ON public.app_platforms TO service_role;
ALTER TABLE public.app_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app platforms member read" ON public.app_platforms FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER app_platforms_updated_at BEFORE UPDATE ON public.app_platforms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CHANNELS ============
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  name text NOT NULL,
  environment text NOT NULL DEFAULT 'development',
  description text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT 'all',
  active_release_id uuid,
  rollout_percentage integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'empty',
  update_policy text NOT NULL DEFAULT 'Immediate on next launch',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, name)
);
CREATE INDEX idx_channels_app ON public.channels(app_id);
CREATE INDEX idx_channels_org ON public.channels(organization_id);
GRANT SELECT ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels member read" ON public.channels FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER channels_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RELEASES ============
CREATE TABLE public.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  number integer NOT NULL,
  platform public.platform_type NOT NULL,
  environment text NOT NULL DEFAULT 'development',
  version text NOT NULL,
  runtime_version text NOT NULL,
  native_version_constraint text NOT NULL DEFAULT '*',
  status public.release_status NOT NULL DEFAULT 'draft',
  rollout_percentage integer NOT NULL DEFAULT 100,
  mandatory boolean NOT NULL DEFAULT false,
  release_notes text NOT NULL DEFAULT '',
  bundle_hash text,
  bundle_size bigint,
  compressed_size bigint,
  storage_path text,
  manifest jsonb,
  git_commit_sha text,
  git_branch text,
  build_number text,
  error_code text,
  error_message text,
  created_by uuid,
  created_by_label text NOT NULL DEFAULT '',
  idempotency_key text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, number),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX idx_releases_app ON public.releases(app_id);
CREATE INDEX idx_releases_org ON public.releases(organization_id);
CREATE INDEX idx_releases_channel_status ON public.releases(channel_id, status);
CREATE INDEX idx_releases_platform ON public.releases(platform);
CREATE INDEX idx_releases_created ON public.releases(created_at DESC);
CREATE INDEX idx_releases_published ON public.releases(published_at DESC);
CREATE INDEX idx_releases_runtime ON public.releases(runtime_version);
GRANT SELECT ON public.releases TO authenticated;
GRANT ALL ON public.releases TO service_role;
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "releases member read" ON public.releases FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER releases_updated_at BEFORE UPDATE ON public.releases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.channels ADD CONSTRAINT channels_active_release_fk
  FOREIGN KEY (active_release_id) REFERENCES public.releases(id) ON DELETE SET NULL;

CREATE TABLE public.release_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  kind text NOT NULL,
  path text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  hash text,
  content_type text,
  status text NOT NULL DEFAULT 'stored',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_release_assets_release ON public.release_assets(release_id);
GRANT SELECT ON public.release_assets TO authenticated;
GRANT ALL ON public.release_assets TO service_role;
ALTER TABLE public.release_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "release assets member read" ON public.release_assets FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TABLE public.deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  release_id uuid REFERENCES public.releases(id) ON DELETE SET NULL,
  previous_release_id uuid REFERENCES public.releases(id) ON DELETE SET NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  source text NOT NULL DEFAULT 'dashboard',
  reason text,
  created_by uuid,
  created_by_label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deployments_org ON public.deployments(organization_id, created_at DESC);
GRANT SELECT ON public.deployments TO authenticated;
GRANT ALL ON public.deployments TO service_role;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deployments member read" ON public.deployments FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TABLE public.rollouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  current_percentage integer NOT NULL DEFAULT 0,
  target_percentage integer NOT NULL DEFAULT 100,
  rollback_threshold numeric NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_id)
);
CREATE INDEX idx_rollouts_org ON public.rollouts(organization_id);
GRANT SELECT ON public.rollouts TO authenticated;
GRANT ALL ON public.rollouts TO service_role;
ALTER TABLE public.rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rollouts member read" ON public.rollouts FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER rollouts_updated_at BEFORE UPDATE ON public.rollouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ API KEYS ============
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  prefix text NOT NULL,
  token_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_org ON public.api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON public.api_keys(prefix);
CREATE UNIQUE INDEX idx_api_keys_hash ON public.api_keys(token_hash);
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- ============ WEBHOOKS ============
CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_delivery_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhooks_org ON public.webhooks(organization_id);
GRANT ALL ON public.webhooks TO service_role;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER webhooks_updated_at BEFORE UPDATE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  status_code integer,
  latency_ms integer,
  attempt integer NOT NULL DEFAULT 1,
  succeeded boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_hook ON public.webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON public.webhook_deliveries(succeeded);
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries member read" ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- ============ ANALYTICS ============
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  release_id uuid REFERENCES public.releases(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  platform public.platform_type NOT NULL,
  installation_id text NOT NULL,
  event_type text NOT NULL,
  runtime_version text,
  native_version text,
  app_version text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_org_created ON public.analytics_events(organization_id, created_at DESC);
CREATE INDEX idx_analytics_app_type ON public.analytics_events(app_id, event_type, created_at DESC);
CREATE INDEX idx_analytics_release ON public.analytics_events(release_id);
CREATE INDEX idx_analytics_install ON public.analytics_events(installation_id);
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics member read" ON public.analytics_events FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- ============ AUDIT ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_label text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  app_id uuid,
  app_name text NOT NULL DEFAULT '',
  result text NOT NULL DEFAULT 'success',
  ip text,
  request_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_action ON public.audit_logs(action);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit member read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'info',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications own read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND public.is_org_member(organization_id, auth.uid())));
CREATE POLICY "notifications own update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ AGENTS ============
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available',
  capabilities text[] NOT NULL DEFAULT '{}',
  approval_policy text NOT NULL DEFAULT 'Human approval required for production actions',
  last_execution_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
GRANT SELECT ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents member read" ON public.agents FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.agent_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tool text NOT NULL,
  mode public.permission_mode NOT NULL DEFAULT 'denied',
  UNIQUE (agent_id, tool)
);
GRANT SELECT ON public.agent_permissions TO authenticated;
GRANT ALL ON public.agent_permissions TO service_role;
ALTER TABLE public.agent_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent perms member read" ON public.agent_permissions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TABLE public.agent_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  app_id uuid,
  input jsonb NOT NULL DEFAULT '{}',
  output jsonb,
  status text NOT NULL DEFAULT 'running',
  error text,
  audit_log_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_agent_exec_agent ON public.agent_executions(agent_id, started_at DESC);
GRANT SELECT ON public.agent_executions TO authenticated;
GRANT ALL ON public.agent_executions TO service_role;
ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent exec member read" ON public.agent_executions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TABLE public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  app_id uuid,
  risk_level text NOT NULL DEFAULT 'medium',
  reasoning text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}',
  status public.approval_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  reason text
);
CREATE INDEX idx_approvals_org ON public.approval_requests(organization_id, status);
GRANT SELECT ON public.approval_requests TO authenticated;
GRANT ALL ON public.approval_requests TO service_role;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approvals member read" ON public.approval_requests FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));