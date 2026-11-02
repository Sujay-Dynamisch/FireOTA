-- Add invite token and expiry to organization_members for secure invite links & email flow
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS invite_token text UNIQUE,
ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_org_members_invite_token
ON public.organization_members (invite_token)
WHERE invite_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_members_user_status
ON public.organization_members (user_id, status)
WHERE user_id IS NOT NULL;


COMMENT ON COLUMN public.organization_members.invite_token IS
  'SHA-256 of the invitation token. The token itself exists only in the emailed link.';

-- One active organization per account, enforced by the database so two simultaneous
-- acceptances cannot both succeed. Skipped with a warning if existing data already breaks the rule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id IS NOT NULL AND status = 'active'
    GROUP BY user_id HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'Accounts with several active organizations exist; uq_org_members_one_active_org was not created.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_org_members_one_active_org
    ON public.organization_members (user_id)
    WHERE user_id IS NOT NULL AND status = 'active';
  END IF;
END $$;
