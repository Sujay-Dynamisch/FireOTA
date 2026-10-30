/**
 * Multi-Cloud Storage Target Factory and Resolver.
 * Instantiates the appropriate StorageProvider for an application or organization.
 */
import { audit, type OrgContext } from "../context.server";
import { decryptSecret, encryptSecret } from "../crypto.server";
import { ApiError, fail } from "../errors";
import { accessTokenFromConnection } from "../firebase.server";
import { AzureBlobStorageProvider } from "./azure.server";
import { ExternalUrlStorageProvider } from "./external.server";
import { FirebaseStorageProvider } from "./firebase.server";
import { GCSStorageProvider } from "./gcs.server";
import { S3StorageProvider } from "./s3.server";
import type {
  AzureCredentials,
  GCSCredentials,
  S3Credentials,
  StorageProvider,
  StorageProviderType,
  StorageTargetRecordData,
  StorageVerificationResult,
} from "./types";

export interface CreateStorageTargetInput {
  name: string;
  provider: StorageProviderType;
  bucket?: string;
  endpoint?: string;
  region?: string;
  publicCdnUrl?: string;
  credentials?: S3Credentials | GCSCredentials | AzureCredentials | Record<string, unknown>;
}

export function buildProviderFromRow(row: {
  id: string;
  name: string;
  provider: StorageProviderType;
  bucket: string | null;
  endpoint: string | null;
  region: string | null;
  public_cdn_url: string | null;
  config_ciphertext: string | null;
}, extraAccessToken?: string): StorageProvider {
  let credentials: Record<string, unknown> = {};
  if (row.config_ciphertext) {
    try {
      credentials = JSON.parse(decryptSecret(row.config_ciphertext)) as Record<string, unknown>;
    } catch {
      // Failed to decrypt
    }
  }

  switch (row.provider) {
    case "s3":
    case "r2":
    case "minio":
      return new S3StorageProvider({
        id: row.id,
        name: row.name,
        bucket: row.bucket ?? "",
        provider: row.provider,
        endpoint: row.endpoint ?? (credentials["endpoint"] as string | undefined),
        region: row.region ?? (credentials["region"] as string | undefined),
        publicCdnUrl: row.public_cdn_url ?? (credentials["publicCdnUrl"] as string | undefined),
        credentials: credentials as unknown as S3Credentials,
      });

    case "gcs":
      return new GCSStorageProvider({
        id: row.id,
        name: row.name,
        bucket: row.bucket ?? "",
        credentials: credentials as unknown as GCSCredentials,
      });

    case "azure":
      return new AzureBlobStorageProvider({
        id: row.id,
        name: row.name,
        bucket: row.bucket ?? "",
        credentials: credentials as unknown as AzureCredentials,
        endpoint: row.endpoint ?? undefined,
      });

    case "firebase":
      return new FirebaseStorageProvider({
        id: row.id,
        name: row.name,
        bucket: row.bucket ?? "",
        accessToken: extraAccessToken ?? (credentials["accessToken"] as string | undefined) ?? "",
      });

    case "external":
      return new ExternalUrlStorageProvider({
        id: row.id,
        name: row.name,
        publicCdnUrl: row.public_cdn_url ?? undefined,
      });

    default:
      fail("STORAGE_ERROR", `Unsupported storage provider type: ${row.provider}`);
  }
}

/** Resolves the StorageProvider connected to an application. */
export async function resolveStorageForApp(ctx: OrgContext, appId: string): Promise<StorageProvider> {
  const { data: app, error } = await ctx.db
    .from("apps")
    .select("id, name, storage_target_id, firebase_project_id")
    .eq("id", appId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error || !app) fail("RESOURCE_NOT_FOUND", "Application not found.");

  // Case 1: App is connected to a multi-cloud storage target
  if (app.storage_target_id) {
    return getStorageProviderById(ctx, app.storage_target_id);
  }

  // Case 2: Legacy app connected to a firebase_project
  if (app.firebase_project_id) {
    return getFirebaseProviderForApp(ctx, app.firebase_project_id);
  }

  fail("STORAGE_TARGET_NOT_FOUND", "Connect a storage provider (AWS S3, Cloudflare R2, MinIO, or Firebase) to this application first.");
}

export async function getStorageProviderById(ctx: OrgContext, targetId: string): Promise<StorageProvider> {
  const { data: target, error } = await ctx.db
    .from("storage_targets")
    .select("id, name, provider, bucket, endpoint, region, public_cdn_url, config_ciphertext, status")
    .eq("id", targetId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error || !target) fail("STORAGE_TARGET_NOT_FOUND", "Storage target not found.");

  let accessToken: string | undefined;
  if (target.provider === "firebase") {
    // Look up Firebase connection refresh token
    const { data: fbProject } = await ctx.db
      .from("firebase_projects")
      .select("firebase_connection_id")
      .eq("id", target.id)
      .maybeSingle();

    if (fbProject?.firebase_connection_id) {
      const { data: conn } = await ctx.db
        .from("firebase_connections")
        .select("refresh_token_ciphertext")
        .eq("id", fbProject.firebase_connection_id)
        .maybeSingle();
      if (conn?.refresh_token_ciphertext) {
        accessToken = await accessTokenFromConnection(conn.refresh_token_ciphertext);
      }
    }
  }

  return buildProviderFromRow(target, accessToken);
}

async function getFirebaseProviderForApp(ctx: OrgContext, firebaseProjectId: string): Promise<StorageProvider> {
  const { data: project } = await ctx.db
    .from("firebase_projects")
    .select("id, display_name, storage_bucket, status, firebase_connection_id")
    .eq("id", firebaseProjectId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (!project?.storage_bucket) fail("FIREBASE_CONNECTION_ERROR", "The connected Firebase project has no storage bucket.");
  if (project.status === "disconnected") fail("FIREBASE_CONNECTION_ERROR", "The Firebase project is disconnected.");

  const { data: connection } = await ctx.db
    .from("firebase_connections")
    .select("refresh_token_ciphertext")
    .eq("id", project.firebase_connection_id ?? "")
    .maybeSingle();

  const accessToken = await accessTokenFromConnection(connection?.refresh_token_ciphertext as string | null);

  return new FirebaseStorageProvider({
    id: project.id,
    name: project.display_name,
    bucket: project.storage_bucket,
    accessToken,
  });
}

/** Lists all storage targets for the organization */
export async function listStorageTargets(ctx: OrgContext): Promise<StorageTargetRecordData[]> {
  const { data, error } = await ctx.db
    .from("storage_targets")
    .select("id, organization_id, name, provider, bucket, endpoint, region, public_cdn_url, status, last_verified_at, created_at, updated_at")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });

  if (error) fail("INTERNAL_ERROR", "Could not fetch storage targets.");
  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    provider: row.provider,
    bucket: row.bucket,
    endpoint: row.endpoint,
    region: row.region,
    publicCdnUrl: row.public_cdn_url,
    status: row.status,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Creates and verifies a new storage target */
export async function createStorageTarget(
  ctx: OrgContext,
  input: CreateStorageTargetInput,
): Promise<{ target: StorageTargetRecordData; verification: StorageVerificationResult }> {
  const encryptedConfig = input.credentials ? encryptSecret(JSON.stringify(input.credentials)) : null;

  const { data: inserted, error } = await ctx.db
    .from("storage_targets")
    .insert({
      organization_id: ctx.organizationId,
      name: input.name.trim(),
      provider: input.provider,
      bucket: input.bucket?.trim() || null,
      endpoint: input.endpoint?.trim() || null,
      region: input.region?.trim() || null,
      public_cdn_url: input.publicCdnUrl?.trim() || null,
      config_ciphertext: encryptedConfig,
      status: "connected",
    })
    .select("id, organization_id, name, provider, bucket, endpoint, region, public_cdn_url, status, last_verified_at, created_at, updated_at")
    .single();

  if (error || !inserted) fail("INTERNAL_ERROR", "Failed to save storage target.");

  // Test live connection immediately
  const provider = buildProviderFromRow({
    ...inserted,
    config_ciphertext: encryptedConfig,
  });

  const verification = await provider.verify();
  const status = verification.ok ? "connected" : "permission_error";

  await ctx.db
    .from("storage_targets")
    .update({
      status,
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", inserted.id);

  await audit(ctx, {
    action: "storage_target.created",
    resourceType: "storage_target",
    resourceId: inserted.id,
    after: { name: inserted.name, provider: inserted.provider, bucket: inserted.bucket, status },
  });

  return {
    target: {
      id: inserted.id,
      organizationId: inserted.organization_id,
      name: inserted.name,
      provider: inserted.provider,
      bucket: inserted.bucket,
      endpoint: inserted.endpoint,
      region: inserted.region,
      publicCdnUrl: inserted.public_cdn_url,
      status,
      lastVerifiedAt: new Date().toISOString(),
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    },
    verification,
  };
}

/** Re-verifies a storage target's live connectivity */
export async function testStorageTarget(ctx: OrgContext, targetId: string): Promise<StorageVerificationResult> {
  const provider = await getStorageProviderById(ctx, targetId);
  const result = await provider.verify();

  await ctx.db
    .from("storage_targets")
    .update({
      status: result.ok ? "connected" : "permission_error",
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", targetId)
    .eq("organization_id", ctx.organizationId);

  return result;
}

/** Deletes a storage target */
export async function deleteStorageTarget(ctx: OrgContext, targetId: string): Promise<boolean> {
  // Check if any app is actively using this storage target
  const { data: apps } = await ctx.db
    .from("apps")
    .select("id, name")
    .eq("storage_target_id", targetId)
    .eq("organization_id", ctx.organizationId);

  if (apps && apps.length > 0) {
    fail("CONFLICT", `Cannot delete storage target while it is connected to ${apps.length} application(s). Reassign or delete those applications first.`);
  }

  const { error } = await ctx.db
    .from("storage_targets")
    .delete()
    .eq("id", targetId)
    .eq("organization_id", ctx.organizationId);

  if (error) fail("INTERNAL_ERROR", "Could not delete storage target.");

  await audit(ctx, {
    action: "storage_target.deleted",
    resourceType: "storage_target",
    resourceId: targetId,
  });

  return true;
}

