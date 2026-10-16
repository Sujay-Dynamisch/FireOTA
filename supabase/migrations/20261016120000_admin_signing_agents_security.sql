-- Admin controls, custom roles, per-member notifications, code signing,
-- Expo-style update IDs, security events and bring-your-own-key agents.

-- 1. Custom roles -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  permissions text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
GRANT SELECT ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom roles member read" ON public.custom_roles FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- 2. Members: custom role, per-member notification state and preferences ------
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notifications_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Notifications: category and deep link -----------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'activity',
  ADD COLUMN IF NOT EXISTS link text;
CREATE INDEX IF NOT EXISTS idx_notifications_org_created ON public.notifications(organization_id, created_at DESC);

-- 4. API keys: last caller IP (new-IP detection) ------------------------------
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_used_ip text;

-- 5. Code signing (per app, optional) ----------------------------------------
ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS code_signing_public_key text,
  ADD COLUMN IF NOT EXISTS code_signing_key_id text,
  ADD COLUMN IF NOT EXISTS code_signing_required boolean NOT NULL DEFAULT false;

-- 6. Releases: signature + Expo-style update groups; version becomes an optional label
ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS signature_key_id text,
  ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE public.releases ALTER COLUMN version SET DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_releases_group ON public.releases(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_releases_runtime ON public.releases(app_id, runtime_version);

-- 7. Security events (malicious / risky activity) -----------------------------
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_label text NOT NULL DEFAULT '',
  ip text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_org ON public.security_events(organization_id, created_at DESC);
GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security events member read" ON public.security_events FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- 8. Agents: bring-your-own AI provider key (server-side only) ---------------
CREATE TABLE IF NOT EXISTS public.agent_ai_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  model text NOT NULL,
  api_key_ciphertext text NOT NULL,
  key_hint text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- The encrypted key never reaches the browser: no grant to authenticated.
GRANT ALL ON public.agent_ai_settings TO service_role;
ALTER TABLE public.agent_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent ai settings server only" ON public.agent_ai_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS triggered_by uuid;
