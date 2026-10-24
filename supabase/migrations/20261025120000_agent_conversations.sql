-- Saved agent chat conversations (ChatGPT/Claude-style history). Private to the member who
-- started them; the whole thread (messages, tool steps, uploads, approvals) is one jsonb array.
CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New chat',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_conversations_owner_recent
  ON public.agent_conversations (organization_id, user_id, updated_at DESC);

-- Read and written only through server functions, which scope every query to the caller.
GRANT ALL ON public.agent_conversations TO service_role;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent conversations server only" ON public.agent_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
