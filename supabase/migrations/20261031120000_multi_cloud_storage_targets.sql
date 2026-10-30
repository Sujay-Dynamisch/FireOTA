-- Multi-Cloud Storage Targets for Sovereign, Client-Owned Storage.
-- Allows clients to connect any storage provider (AWS S3, Cloudflare R2, Google Cloud Storage,
-- MinIO, Azure Blob, Wasabi, DigitalOcean Spaces, or Bring Your Own URL) without proprietary bundle hosting.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'storage_provider_type') THEN
    CREATE TYPE public.storage_provider_type AS ENUM (
      's3',
      'r2',
      'gcs',
      'minio',
      'azure',
      'firebase',
      'external'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.storage_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider public.storage_provider_type NOT NULL,
  bucket text,
  endpoint text,
  region text,
  public_cdn_url text,
  -- Encrypted credentials JSON via AES-256-GCM (accessKeyId, secretAccessKey, serviceAccountJson, etc.)
  config_ciphertext text,
  status text NOT NULL DEFAULT 'connected',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storage_targets_org_idx ON public.storage_targets (organization_id);

GRANT ALL ON public.storage_targets TO service_role;
ALTER TABLE public.storage_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "storage_targets_service_role" ON public.storage_targets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add storage_target_id to apps table
ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS storage_target_id uuid REFERENCES public.storage_targets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS apps_storage_target_idx ON public.apps (storage_target_id);

-- Add external_bundle_url to releases table for Bring-Your-Own-URL (BYOU)
ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS external_bundle_url text;

-- Auto-migrate existing firebase_projects into storage_targets for backward compatibility
INSERT INTO public.storage_targets (
  id,
  organization_id,
  name,
  provider,
  bucket,
  status,
  last_verified_at,
  created_at,
  updated_at
)
SELECT 
  fp.id,
  fp.organization_id,
  fp.display_name,
  'firebase'::public.storage_provider_type,
  fp.storage_bucket,
  fp.status::text,
  fp.last_verified_at,
  fp.created_at,
  fp.updated_at
FROM public.firebase_projects fp
ON CONFLICT (id) DO NOTHING;

-- Populate storage_target_id on apps where firebase_project_id is set
UPDATE public.apps
SET storage_target_id = firebase_project_id
WHERE firebase_project_id IS NOT NULL AND storage_target_id IS NULL;

