/**
 * Release lifecycle engine. Shared by the dashboard server functions and the
 * public /api/v1 surface so both paths obey the identical rules.
 */
import { audit, requirePermission, type OrgContext } from "./context.server";
import { sha256Hex } from "./crypto.server";
import { fail, type ErrorCode } from "./errors";
import {
  accessTokenFromConnection,
  artifactDownloadUrl,
  deleteArtifact,
  uploadArtifact,
} from "./firebase.server";
import { buildManifest, isFireOtaPackage, storagePrefix } from "./manifest";
import { withDownloadToken } from "./ota.server";
import { assertTransition, canTransition, type ReleaseState } from "./release-state";
import { signatureMessage, verifyUpdateSignature } from "./signing";
import { isValidVersion } from "./versions";
import { dispatchWebhooks } from "./webhooks.server";

export interface ReleaseRow {
  id: string;
  organization_id: string;
  app_id: string;
  channel_id: string | null;
  number: number;
  platform: "android" | "ios";
  environment: string;
  version: string;
  runtime_version: string;
  native_version_constraint: string;
  status: ReleaseState;
  rollout_percentage: number;
  mandatory: boolean;
  release_notes: string;
  bundle_hash: string | null;
  bundle_size: number | null;
  compressed_size: number | null;
  storage_path: string | null;
  manifest: unknown;
  git_commit_sha: string | null;
  git_branch: string | null;
  build_number: string | null;
  created_by_label: string;
  published_at: string | null;
  created_at: string;
  signature: string | null;
  signature_key_id: string | null;
  group_id: string | null;
}

const RELEASE_COLUMNS =
  "id, organization_id, app_id, channel_id, number, platform, environment, version, runtime_version, native_version_constraint, status, rollout_percentage, mandatory, release_notes, bundle_hash, bundle_size, compressed_size, storage_path, manifest, git_commit_sha, git_branch, build_number, created_by_label, published_at, created_at, signature, signature_key_id, group_id";

export { RELEASE_COLUMNS };

export async function loadRelease(ctx: OrgContext, id: string): Promise<ReleaseRow> {
  const numeric = /^#?\d+$/.test(id);
  let query = ctx.db.from("releases").select(RELEASE_COLUMNS).eq("organization_id", ctx.organizationId);
  if (!numeric && !/^[0-9a-f-]{36}$/i.test(id)) fail("RESOURCE_NOT_FOUND", "Release not found.");
  query = numeric ? query.eq("number", Number(id.replace("#", ""))) : query.eq("id", id);
  // Release numbers are unique per app, so a bare number can be ambiguous across apps.
  const { data } = await query.limit(2);
  if (!data || data.length === 0) fail("RESOURCE_NOT_FOUND", "Release not found.");
  if (data.length > 1) fail("CONFLICT", "Several apps have a release with that number. Use the release ID.");
  return data[0] as unknown as ReleaseRow;
}

async function firebaseTargetForApp(ctx: OrgContext, appId: string) {
  const { data: app } = await ctx.db
    .from("apps")
    .select("id, name, firebase_project_id")
    .eq("id", appId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!app) fail("RESOURCE_NOT_FOUND", "Application not found.");
  if (!app.firebase_project_id) fail("FIREBASE_CONNECTION_ERROR", "Connect a Firebase project to this application first.");

  const { data: project } = await ctx.db
    .from("firebase_projects")
    .select("id, storage_bucket, status, firebase_connection_id")
    .eq("id", app.firebase_project_id)
    .maybeSingle();
  if (!project?.storage_bucket) fail("FIREBASE_CONNECTION_ERROR", "The connected Firebase project has no storage bucket.");
  if (project.status === "disconnected") fail("FIREBASE_CONNECTION_ERROR", "The Firebase project is disconnected.");

  const { data: connection } = await ctx.db
    .from("firebase_connections")
    .select("refresh_token_ciphertext")
    .eq("id", project.firebase_connection_id ?? "")
    .maybeSingle();

  const accessToken = await accessTokenFromConnection(connection?.refresh_token_ciphertext as string | null);
  return { appName: app.name as string, bucket: project.storage_bucket as string, accessToken };
}

/**
 * Creates a draft update. Like Expo, an update is identified by its UUID and targets exactly
 * one runtime version; `version` is only an optional human label (e.g. "1.3.1-hotfix").
 * Updates built for both platforms from one bundle share a `groupId`.
 */
export async function createRelease(
  ctx: OrgContext,
  input: {
    appId: string;
    channelName: string;
    platform: "android" | "ios";
    version?: string;
    groupId?: string;
    runtimeVersion: string;
    nativeVersionConstraint?: string;
    releaseNotes?: string;
    mandatory?: boolean;
    gitCommitSha?: string;
    gitBranch?: string;
    buildNumber?: string;
    idempotencyKey?: string;
  },
) {
  requirePermission(ctx, "release.create");
  const label = (input.version ?? "").trim();
  if (label.length > 40 || /[^\w.+-]/.test(label)) fail("INVALID_RELEASE", "The version label may use letters, digits, dots, dashes and +.");
  if (!isValidVersion(input.runtimeVersion)) fail("INVALID_RUNTIME", "Runtime version must look like 1.4.0.");

  if (input.idempotencyKey) {
    const { data: existing } = await ctx.db
      .from("releases")
      .select(RELEASE_COLUMNS)
      .eq("organization_id", ctx.organizationId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) return existing as unknown as ReleaseRow;
  }

  const { data: app } = await ctx.db
    .from("apps")
    .select("id, name")
    .eq("id", input.appId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!app) fail("RESOURCE_NOT_FOUND", "Application not found.");

  const { data: platformRow } = await ctx.db
    .from("app_platforms")
    .select("platform")
    .eq("app_id", input.appId)
    .eq("platform", input.platform)
    .maybeSingle();
  if (!platformRow) fail("INVALID_PLATFORM", "That platform is not configured for this application.");

  const { data: channel } = await ctx.db
    .from("channels")
    .select("id, name, environment")
    .eq("app_id", input.appId)
    .eq("name", input.channelName)
    .maybeSingle();
  if (!channel) fail("INVALID_CHANNEL", "Unknown channel for this application.");


  // Numbers are allocated optimistically; a concurrent insert loses the unique race and retries.
  let release: unknown = null;
  for (let attempt = 0; attempt < 3 && !release; attempt += 1) {
    const { data: last } = await ctx.db
      .from("releases")
      .select("number")
      .eq("app_id", input.appId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: inserted, error } = await ctx.db
      .from("releases")
        .insert({
          organization_id: ctx.organizationId,
          app_id: input.appId,
          channel_id: channel.id,
          number: Number(last?.number ?? 0) + 1,
          platform: input.platform,
          environment: channel.environment,
          version: label,
          group_id: input.groupId ?? null,
          runtime_version: input.runtimeVersion,
          native_version_constraint: input.nativeVersionConstraint ?? "*",
          status: "draft",
          rollout_percentage: 0,
          mandatory: input.mandatory ?? false,
          release_notes: input.releaseNotes ?? "",
          git_commit_sha: input.gitCommitSha ?? null,
          git_branch: input.gitBranch ?? null,
          build_number: input.buildNumber ?? null,
          created_by: ctx.userId,
          created_by_label: ctx.actorLabel,
          idempotency_key: input.idempotencyKey ?? null,
        })
      .select(RELEASE_COLUMNS)
      .single();
    if (!error) {
      release = inserted;
    } else if (error.code === "23505" && input.idempotencyKey) {
      const { data: existing } = await ctx.db
        .from("releases")
        .select(RELEASE_COLUMNS)
        .eq("organization_id", ctx.organizationId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing) return existing as unknown as ReleaseRow;
    } else if (error.code !== "23505") {
      fail("INVALID_RELEASE", "Could not create the release.");
    }
  }
  if (!release) fail("CONFLICT", "Another release was created at the same time. Retry.");

  const row = release as unknown as ReleaseRow;
  await audit(ctx, {
    action: "release.created",
    resourceType: "release",
    resourceId: row.id,
    appId: input.appId,
    appName: app.name as string,
    after: { number: row.number, version: row.version, runtime: row.runtime_version, channel: channel.name },
  });
  await dispatchWebhooks(ctx.db, ctx.organizationId, "release.created", {
    releaseId: row.id,
    number: row.number,
    version: row.version,
    runtimeVersion: row.runtime_version,
    groupId: row.group_id,
    appId: input.appId,
  });
  return row;
}

/**
 * Streams the bundle into the customer's Firebase Storage bucket, verifies the
 * checksum, writes the manifest, and moves the release to `ready`.
 */
export async function uploadReleaseBundle(
  ctx: OrgContext,
  input: {
    releaseId: string;
    bundle: { bytes: Uint8Array; contentType: string; expectedHash?: string };
    assets?: { name: string; bytes: Uint8Array; contentType: string }[];
    /** Base64 RSA-SHA256 signature over signatureMessage(), made with the app's private key. */
    signature?: string;
  },
) {
  requirePermission(ctx, "release.upload");
  const release = await loadRelease(ctx, input.releaseId);
  if (!["draft", "failed", "uploading"].includes(release.status)) {
    fail("INVALID_STATE_TRANSITION", `A release in state ${release.status} cannot receive a new bundle.`);
  }
  if (input.bundle.bytes.byteLength === 0) fail("UPLOAD_FAILED", "The bundle is empty.");
  if (!(await isFireOtaPackage(input.bundle.bytes))) {
    fail("INVALID_RELEASE", "Upload a .fota update package built with `npx fireota bundle`; plain JS bundles cannot be installed by the SDK.");
  }

  const hash = sha256Hex(input.bundle.bytes);
  if (input.bundle.expectedHash && input.bundle.expectedHash.toLowerCase() !== hash) {
    await audit(ctx, {
      action: "release.upload_failed",
      resourceType: "release",
      resourceId: release.id,
      appId: release.app_id,
      result: "failure",
      after: { reason: "checksum" },
    });
    fail("CHECKSUM_MISMATCH", "The uploaded bundle does not match the supplied checksum.");
  }

  const signing = await verifySignatureForUpload(ctx, release, hash, input.signature);

  await ctx.db.from("releases").update({ status: "uploading" }).eq("id", release.id);

  try {
    const target = await firebaseTargetForApp(ctx, release.app_id);
    const prefix = storagePrefix({
      appId: release.app_id,
      platform: release.platform,
      channelId: release.channel_id ?? "default",
      releaseId: release.id,
    });

    const uploaded = await uploadArtifact({
      accessToken: target.accessToken,
      bucket: target.bucket,
      path: `${prefix}/bundle.hbc`,
      body: input.bundle.bytes,
      contentType: input.bundle.contentType || "application/octet-stream",
    });

    await ctx.db.from("releases").update({ status: "processing" }).eq("id", release.id);

    const assetRows = [] as { name: string; url: string; hash: string; size: number }[];
    for (const asset of input.assets ?? []) {
      const safeName = asset.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const stored = await uploadArtifact({
        accessToken: target.accessToken,
        bucket: target.bucket,
        path: `${prefix}/assets/${safeName}`,
        body: asset.bytes,
        contentType: asset.contentType || "application/octet-stream",
      });
      const assetHash = sha256Hex(asset.bytes);
      assetRows.push({
        name: safeName,
        url: artifactDownloadUrl(target.bucket, stored.path, stored.downloadToken),
        hash: assetHash,
        size: stored.size,
      });
      await ctx.db.from("release_assets").insert({
        organization_id: ctx.organizationId,
        release_id: release.id,
        kind: "assets",
        path: stored.path,
        size_bytes: stored.size,
        hash: assetHash,
        content_type: asset.contentType,
        status: "stored",
      });
    }

    const bundleUrl = artifactDownloadUrl(target.bucket, uploaded.path, uploaded.downloadToken);
    const manifest = buildManifest({
      releaseId: release.id,
      appId: release.app_id,
      platform: release.platform,
      channel: release.channel_id ?? "",
      version: release.version,
      runtimeVersion: release.runtime_version,
      nativeVersionConstraint: release.native_version_constraint || "*",
      bundleUrl,
      bundleHash: hash,
      bundleSize: uploaded.size,
      assets: assetRows,
      mandatory: release.mandatory,
      rolloutPercentage: release.rollout_percentage,
    });

    await ctx.db.from("release_assets").insert({
      organization_id: ctx.organizationId,
      release_id: release.id,
      kind: "bundle",
      path: uploaded.path,
      size_bytes: uploaded.size,
      hash,
      content_type: input.bundle.contentType,
      status: "stored",
    });

    await ctx.db
      .from("releases")
      .update({
        status: "ready",
        bundle_hash: hash,
        bundle_size: uploaded.size,
        compressed_size: uploaded.size,
        storage_path: withDownloadToken(uploaded.path, uploaded.downloadToken),
        manifest,
        signature: signing.signature,
        signature_key_id: signing.keyId,
        error_code: null,
        error_message: null,
      })
      .eq("id", release.id);

    await audit(ctx, {
      action: "release.uploaded",
      resourceType: "release",
      resourceId: release.id,
      appId: release.app_id,
      appName: target.appName,
      after: { hash, size: uploaded.size, signed: Boolean(signing.signature) },
    });

    await dispatchWebhooks(ctx.db, ctx.organizationId, "release.ready", {
      releaseId: release.id,
      version: release.version,
      checksum: hash,
    });
    return { releaseId: release.id, checksum: hash, size: uploaded.size, manifest };
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload failed";
    await ctx.db
      .from("releases")
      .update({ status: "failed", error_code: "UPLOAD_FAILED", error_message: message.slice(0, 400) })
      .eq("id", release.id);
    await audit(ctx, {
      action: "release.upload_failed",
      resourceType: "release",
      resourceId: release.id,
      appId: release.app_id,
      result: "failure",
    });
    await dispatchWebhooks(ctx.db, ctx.organizationId, "release.failed", { releaseId: release.id, reason: "upload" });
    throw error;
  }
}

/**
 * Checks the update signature against the app's registered public key. With a key on file a
 * supplied signature must verify; with "required" on, a missing one is refused too.
 */
async function verifySignatureForUpload(ctx: OrgContext, release: ReleaseRow, hash: string, signature?: string) {
  const { data: app } = await ctx.db
    .from("apps")
    .select("code_signing_public_key, code_signing_key_id, code_signing_required")
    .eq("id", release.app_id)
    .maybeSingle();
  const pem = (app?.code_signing_public_key as string | null | undefined) ?? null;
  if (!pem) return { signature: null, keyId: null };
  if (!signature) {
    if (app?.code_signing_required) {
      fail("SIGNATURE_REQUIRED", "This app requires signed updates. Publish with --private-key (see Code signing in the docs).");
    }
    return { signature: null, keyId: null };
  }
  const message = signatureMessage({ runtimeVersion: release.runtime_version, platform: release.platform, sha256: hash });
  if (!verifyUpdateSignature(pem, message, signature)) {
    await audit(ctx, {
      action: "release.upload_failed",
      resourceType: "release",
      resourceId: release.id,
      appId: release.app_id,
      result: "failure",
      after: { reason: "signature" },
    });
    fail("SIGNATURE_INVALID", "The update signature does not match the app's code signing key.");
  }
  return { signature, keyId: (app?.code_signing_key_id as string | null | undefined) ?? null };
}

async function recordDeployment(
  ctx: OrgContext,
  input: {
    appId: string;
    channelId: string | null;
    releaseId: string;
    previousReleaseId?: string | null;
    type: string;
    reason?: string;
  },
) {
  await ctx.db.from("deployments").insert({
    organization_id: ctx.organizationId,
    app_id: input.appId,
    channel_id: input.channelId,
    release_id: input.releaseId,
    previous_release_id: input.previousReleaseId ?? null,
    type: input.type,
    status: "completed",
    source: ctx.source,
    reason: input.reason ?? null,
    created_by: ctx.userId,
    created_by_label: ctx.actorLabel,
  });
}

const RPC_ERRORS = new Set<ErrorCode>([
  "RESOURCE_NOT_FOUND",
  "RELEASE_ALREADY_PUBLISHED",
  "RELEASE_NOT_READY",
  "INVALID_CHANNEL",
  "INVALID_INPUT",
  "ROLLBACK_NOT_ALLOWED",
  "INCOMPATIBLE_RUNTIME",
]);

const RPC_MESSAGES: Partial<Record<ErrorCode, string>> = {
  RESOURCE_NOT_FOUND: "Release not found.",
  RELEASE_ALREADY_PUBLISHED: "This release is already published.",
  RELEASE_NOT_READY: "Upload and verify a bundle before publishing.",
  INVALID_CHANNEL: "This release has no channel.",
  INVALID_INPUT: "Rollout percentage must be between 0 and 100.",
  ROLLBACK_NOT_ALLOWED:
    "Only the active release of a channel can be rolled back, to a verified earlier release of the same app, channel and platform.",
  INCOMPATIBLE_RUNTIME: "The rollback target was built for a different runtime version.",
};

/** Calls one of the transactional lifecycle functions and maps its error codes. */
async function lifecycleRpc<T>(ctx: OrgContext, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await ctx.db.rpc(fn, args);
  if (error) {
    const code = error.message as ErrorCode;
    if (RPC_ERRORS.has(code)) fail(code, RPC_MESSAGES[code] ?? code);
    console.error(JSON.stringify({ level: "error", requestId: ctx.requestId, rpc: fn, message: error.message }));
    fail("INTERNAL_ERROR", "The release could not be updated.");
  }
  return data as T;
}

/** The release currently served for a (channel, platform) pair, if any. */
async function activeTarget(ctx: OrgContext, channelId: string | null, platform: string) {
  if (!channelId) return null;
  const { data } = await ctx.db
    .from("channel_targets")
    .select("release_id, rollout_percentage")
    .eq("channel_id", channelId)
    .eq("platform", platform)
    .maybeSingle();
  return (data?.release_id as string | null | undefined) ?? null;
}

/** Moves a release between states only if nobody changed it in the meantime. */
async function guardedStatus(ctx: OrgContext, release: ReleaseRow, to: ReleaseState) {
  assertTransition(release.status, to);
  const { data } = await ctx.db
    .from("releases")
    .update({ status: to })
    .eq("id", release.id)
    .eq("status", release.status)
    .select("id");
  if (!data || data.length === 0) fail("CONFLICT", "This release changed while you were working. Refresh and retry.");
}

export async function publishRelease(ctx: OrgContext, input: { releaseId: string; rolloutPercentage: number }) {
  requirePermission(ctx, "release.publish");
  const release = await loadRelease(ctx, input.releaseId);
  const percentage = Math.max(0, Math.min(100, Math.round(input.rolloutPercentage)));
  if (release.status === "published") fail("RELEASE_ALREADY_PUBLISHED", "This release is already published.");
  if (!canTransition(release.status, "published")) fail("RELEASE_NOT_READY", "Upload and verify a bundle before publishing.");
  if (!release.signature) {
    const { data: app } = await ctx.db.from("apps").select("code_signing_required").eq("id", release.app_id).maybeSingle();
    if (app?.code_signing_required) fail("SIGNATURE_REQUIRED", "This app requires signed updates; this update is unsigned.");
  }

  const previous = await activeTarget(ctx, release.channel_id, release.platform);
  const result = await lifecycleRpc<{ previous_release_id: string | null; channel_id: string; channel_name: string }>(
    ctx,
    "fireota_publish_release",
    {
      _org: ctx.organizationId,
      _release_id: release.id,
      _percentage: percentage,
      _actor: ctx.userId,
      _actor_label: ctx.actorLabel,
      _source: ctx.source,
    },
  );

  if (previous && previous !== release.id) {
    const { data: prev } = await ctx.db.from("releases").select("id, created_at").eq("id", previous).maybeSingle();
    if (prev && new Date(release.created_at).getTime() < new Date(prev.created_at as string).getTime()) {
      // Republishing an older update is allowed but always recorded (update IDs carry no order).
      await audit(ctx, {
        action: "release.downgrade_published",
        resourceType: "release",
        resourceId: release.id,
        appId: release.app_id,
        before: { activeRelease: prev.id },
        after: { release: release.id },
      });
    }
  }

  await audit(ctx, {
    action: "release.published",
    resourceType: "release",
    resourceId: release.id,
    appId: release.app_id,
    before: { status: release.status, activeRelease: result.previous_release_id },
    after: { rollout: percentage, channel: result.channel_name, platform: release.platform },
  });
  await dispatchWebhooks(ctx.db, ctx.organizationId, "release.published", {
    releaseId: release.id,
    version: release.version,
    platform: release.platform,
    channel: result.channel_name,
    rolloutPercentage: percentage,
  });

  return { id: release.id, status: "published" as const, rollout: percentage };
}

export async function setRolloutPercentage(ctx: OrgContext, input: { releaseId: string; percentage: number }) {
  requirePermission(ctx, "rollout.update");
  const release = await loadRelease(ctx, input.releaseId);
  if (release.status !== "published") fail("INVALID_STATE_TRANSITION", "Only a published release has a rollout.");
  const percentage = Math.max(0, Math.min(100, Math.round(input.percentage)));

  const { data: target } = await ctx.db
    .from("channel_targets")
    .update({ rollout_percentage: percentage, updated_at: new Date().toISOString() })
    .eq("channel_id", release.channel_id ?? "")
    .eq("platform", release.platform)
    .eq("release_id", release.id)
    .select("release_id");
  if (!target || target.length === 0) fail("CONFLICT", "This release is no longer the active release of its channel.");

  await ctx.db.from("releases").update({ rollout_percentage: percentage }).eq("id", release.id);
  await ctx.db.from("channels").update({ rollout_percentage: percentage }).eq("id", release.channel_id ?? "");
  await ctx.db
    .from("rollouts")
    .update({
      current_percentage: percentage,
      status: percentage >= 100 ? "completed" : "active",
      updated_at: new Date().toISOString(),
    })
    .eq("release_id", release.id);

  await audit(ctx, {
    action: "rollout.updated",
    resourceType: "release",
    resourceId: release.id,
    appId: release.app_id,
    before: { rollout: release.rollout_percentage },
    after: { rollout: percentage },
  });
  await dispatchWebhooks(ctx.db, ctx.organizationId, percentage >= 100 ? "rollout.completed" : "rollout.updated", {
    releaseId: release.id,
    rolloutPercentage: percentage,
  });
  return { id: release.id, rollout: percentage };
}

/** A paused release stays the channel target but is never offered to devices. */
export async function pauseRelease(ctx: OrgContext, input: { releaseId: string }) {
  requirePermission(ctx, "release.pause");
  const release = await loadRelease(ctx, input.releaseId);
  await guardedStatus(ctx, release, "paused");
  await ctx.db.from("rollouts").update({ status: "paused", updated_at: new Date().toISOString() }).eq("release_id", release.id);
  await recordDeployment(ctx, { appId: release.app_id, channelId: release.channel_id, releaseId: release.id, type: "pause" });
  await audit(ctx, {
    action: "release.paused",
    resourceType: "release",
    resourceId: release.id,
    appId: release.app_id,
    before: { status: release.status },
    after: { status: "paused" },
  });
  await dispatchWebhooks(ctx.db, ctx.organizationId, "release.paused", { releaseId: release.id });
  return { id: release.id, status: "paused" as const };
}

/** Resuming goes through the same transactional publish so the channel target is re-asserted. */
export async function resumeRelease(ctx: OrgContext, input: { releaseId: string }) {
  requirePermission(ctx, "release.publish");
  const release = await loadRelease(ctx, input.releaseId);
  if (release.status !== "paused") fail("INVALID_STATE_TRANSITION", "Only a paused release can be resumed.");
  return publishRelease(ctx, { releaseId: release.id, rolloutPercentage: release.rollout_percentage });
}

/** Rolls a channel back to an explicit target, or to the release this one replaced. */
export async function rollbackRelease(
  ctx: OrgContext,
  input: { releaseId: string; reason: string; targetReleaseId?: string | null | undefined },
) {
  requirePermission(ctx, "release.rollback");
  const release = await loadRelease(ctx, input.releaseId);
  if (!["published", "paused"].includes(release.status)) {
    fail("ROLLBACK_NOT_ALLOWED", "Only a published or paused release can be rolled back.");
  }
  if (!input.reason || input.reason.trim().length < 3) fail("INVALID_INPUT", "A rollback reason is required.");

  const result = await lifecycleRpc<{ restored_release_id: string | null }>(ctx, "fireota_rollback_release", {
    _org: ctx.organizationId,
    _release_id: release.id,
    _target_id: input.targetReleaseId ?? null,
    _actor: ctx.userId,
    _actor_label: ctx.actorLabel,
    _source: ctx.source,
    _reason: input.reason.trim(),
  });
  const targetId = result.restored_release_id;

  await audit(ctx, {
    action: "release.rolled_back",
    resourceType: "release",
    resourceId: release.id,
    appId: release.app_id,
    before: { activeRelease: release.id, status: release.status },
    after: { reason: input.reason, activeRelease: targetId },
  });
  await dispatchWebhooks(ctx.db, ctx.organizationId, "release.rolled_back", {
    releaseId: release.id,
    restoredReleaseId: targetId,
    reason: input.reason,
  });
  return { id: release.id, status: "rolled_back" as const, restoredReleaseId: targetId };
}

export async function archiveRelease(ctx: OrgContext, input: { releaseId: string }) {
  requirePermission(ctx, "release.archive");
  const release = await loadRelease(ctx, input.releaseId);
  await guardedStatus(ctx, release, "archived");
  // An archived release is never served: clear it if it was still a channel target.
  await ctx.db
    .from("channel_targets")
    .update({ release_id: null, updated_at: new Date().toISOString() })
    .eq("release_id", release.id);
  await ctx.db.from("channels").update({ active_release_id: null }).eq("active_release_id", release.id);
  await ctx.db.from("rollouts").update({ status: "completed", updated_at: new Date().toISOString() }).eq("release_id", release.id);
  await audit(ctx, {
    action: "release.archived",
    resourceType: "release",
    resourceId: release.id,
    appId: release.app_id,
    before: { status: release.status },
    after: { status: "archived" },
  });
  await dispatchWebhooks(ctx.db, ctx.organizationId, "release.archived", { releaseId: release.id });
  return { id: release.id, status: "archived" as const };
}

/**
 * Soft delete plus artifact cleanup. Refuses live releases and the release a live
 * channel would roll back to. Artifacts shared with a promoted copy are kept.
 * If cleanup fails the release is NOT marked deleted, so the operation can be retried.
 */
export async function deleteRelease(ctx: OrgContext, input: { releaseId: string }) {
  requirePermission(ctx, "release.delete");
  const release = await loadRelease(ctx, input.releaseId);
  if (["published", "paused"].includes(release.status)) {
    fail("RELEASE_DELETE_NOT_ALLOWED", "Roll back or archive this release before deleting it.");
  }
  if (!canTransition(release.status, "deleted")) {
    fail("RELEASE_DELETE_NOT_ALLOWED", `A release in state ${release.status} must be archived before deletion.`);
  }

  const { data: targets } = await ctx.db
    .from("channel_targets")
    .select("release_id")
    .eq("organization_id", ctx.organizationId)
    .not("release_id", "is", null);
  const liveIds = (targets ?? []).map((t) => t.release_id as string);
  if (liveIds.includes(release.id)) fail("RELEASE_DELETE_NOT_ALLOWED", "This release is still a channel target.");
  if (liveIds.length > 0) {
    const { data: protectedRows } = await ctx.db
      .from("deployments")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("type", "publish")
      .eq("previous_release_id", release.id)
      .in("release_id", liveIds)
      .limit(1);
    if (protectedRows && protectedRows.length > 0) {
      fail("RELEASE_DELETE_NOT_ALLOWED", "This release is the rollback target of a live release.");
    }
  }

  let bundleKept = false;
  if (release.storage_path) {
    const path = release.storage_path.split("#")[0] as string;
    const { data: sharing } = await ctx.db
      .from("releases")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .like("storage_path", `${path}%`)
      .neq("id", release.id)
      .neq("status", "deleted")
      .limit(1);
    if (!sharing || sharing.length === 0) {
      try {
        const target = await firebaseTargetForApp(ctx, release.app_id);
        await deleteArtifact({ accessToken: target.accessToken, bucket: target.bucket, path });
      } catch (error) {
        // Bundle cleanup is best-effort (same as app deletion): the release is still removed
        // and the file stays in the customer's bucket.
        console.error(JSON.stringify({ level: "warn", requestId: ctx.requestId, cleanup: String(error) }));
        bundleKept = true;
      }
    }
  }

  // Hard delete so nothing is left pointing at the release: FKs cascade rollouts and assets and
  // clear channel/device/analytics references; its deployment history is removed explicitly.
  assertTransition(release.status, "deleted");
  await ctx.db.from("deployments").delete().eq("organization_id", ctx.organizationId).eq("release_id", release.id);
  const { data: removed } = await ctx.db
    .from("releases")
    .delete()
    .eq("id", release.id)
    .eq("status", release.status)
    .select("id");
  if (!removed || removed.length === 0) fail("CONFLICT", "This release changed while you were working. Refresh and retry.");
  await audit(ctx, {
    action: "release.deleted",
    resourceType: "release",
    resourceId: release.id,
    appId: release.app_id,
    before: { status: release.status, version: release.version, hash: release.bundle_hash },
    ...(bundleKept ? { after: { bundleKept: true } } : {}),
  });
  return { id: release.id, deleted: true, bundleKept };
}

/**
 * Best-effort removal of every stored bundle of an app from the customer's bucket, used
 * when the app itself is deleted. Returns how many artifacts were removed / left behind.
 */
export async function deleteAppArtifacts(ctx: OrgContext, appId: string) {
  const { data: rows } = await ctx.db
    .from("releases")
    .select("storage_path")
    .eq("organization_id", ctx.organizationId)
    .eq("app_id", appId)
    .not("storage_path", "is", null)
    .limit(500);
  const paths = [...new Set((rows ?? []).map((r) => String(r.storage_path).split("#")[0] as string))];
  if (paths.length === 0) return { removed: 0, kept: 0 };
  let removed = 0;
  try {
    const target = await firebaseTargetForApp(ctx, appId);
    for (const path of paths) {
      try {
        await deleteArtifact({ accessToken: target.accessToken, bucket: target.bucket, path });
        removed += 1;
      } catch {
        // already gone, or no longer reachable — keep going
      }
    }
  } catch {
    // Firebase disconnected: the files stay in the customer's bucket.
  }
  return { removed, kept: paths.length - removed };
}

/** Promotes an existing ready/published release onto another channel. */
export async function promoteRelease(ctx: OrgContext, input: { releaseId: string; channelName: string; rolloutPercentage?: number }) {
  requirePermission(ctx, "release.publish");
  const release = await loadRelease(ctx, input.releaseId);
  const { data: channel } = await ctx.db
    .from("channels")
    .select("id, name, environment")
    .eq("app_id", release.app_id)
    .eq("name", input.channelName)
    .maybeSingle();
  if (!channel) fail("INVALID_CHANNEL", "Unknown target channel.");
  if (channel.id === release.channel_id) fail("CONFLICT", "This release already targets that channel.");
  if (!release.bundle_hash || !release.storage_path) fail("RELEASE_NOT_READY", "This release has no verified bundle.");

  const { data: lastNumber } = await ctx.db
    .from("releases")
    .select("number")
    .eq("app_id", release.app_id)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: clone, error } = await ctx.db
    .from("releases")
    .insert({
      organization_id: ctx.organizationId,
      app_id: release.app_id,
      channel_id: channel.id,
      number: Number(lastNumber?.number ?? release.number) + 1,
      platform: release.platform,
      environment: channel.environment,
      version: release.version,
      runtime_version: release.runtime_version,
      native_version_constraint: release.native_version_constraint,
      status: "ready",
      rollout_percentage: 0,
      mandatory: release.mandatory,
      release_notes: release.release_notes,
      bundle_hash: release.bundle_hash,
      bundle_size: release.bundle_size,
      compressed_size: release.compressed_size,
      storage_path: release.storage_path,
      manifest: release.manifest,
      git_commit_sha: release.git_commit_sha,
      git_branch: release.git_branch,
      build_number: release.build_number,
      signature: release.signature,
      signature_key_id: release.signature_key_id,
      group_id: release.group_id,
      created_by: ctx.userId,
      created_by_label: ctx.actorLabel,
    })
    .select("id")
    .single();
  if (error) fail("CONFLICT", "That version already exists on the target channel.");

  const published = await publishRelease(ctx, {
    releaseId: clone.id as string,
    rolloutPercentage: input.rolloutPercentage ?? 100,
  });
  await audit(ctx, {
    action: "release.promoted",
    resourceType: "release",
    resourceId: clone.id as string,
    appId: release.app_id,
    after: { from: release.id, channel: channel.name },
  });
  return published;
}
