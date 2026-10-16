/**
 * The OTA engine. Decides, for one device, whether an update exists — and records
 * the telemetry that powers analytics and automatic rollback thresholds.
 *
 * Rules, in order:
 *   1. app + channel must exist and be active
 *   2. channel must have a published active release
 *   3. release runtime version must equal the device runtime version
 *   4. device native version must satisfy the release native constraint
 *   5. device must fall inside the deterministic rollout bucket
 *   6. the device must not already be running that release
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "./errors";
import { artifactDownloadUrl } from "./firebase.server";
import { isServable, type ReleaseState } from "./release-state";
import { inRollout, runtimeCompatible, satisfiesConstraint } from "./versions";

export interface UpdateCheckInput {
  appKey: string;
  channelName: string;
  platform: "android" | "ios";
  installationId: string;
  runtimeVersion: string;
  nativeVersion?: string;
  appVersion?: string;
  currentReleaseId?: string | null;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  reason?: string;
  release?: {
    id: string;
    version: string;
    runtimeVersion: string;
    mandatory: boolean;
    notes: string;
    /** Same as notes; Expo calls the update description its "message". */
    message: string;
    groupId: string | null;
    createdAt: string;
    bundle: { url: string; hash: string; size: number };
    /** Present when the app uses code signing: base64 RSA-SHA256 over the signed message. */
    signature: { value: string; keyId: string | null; algorithm: "rsa-v1_5-sha256" } | null;
    manifest: unknown;
  };
}

/**
 * Devices identify their app by its UUID (preferred) or by its slug. Slugs are only
 * unique per organization, so a slug shared by two organizations is rejected rather
 * than guessed. Input never reaches a PostgREST filter string.
 */
export async function resolveApp(db: SupabaseClient, appKey: string) {
  const columns = "id, organization_id, slug, status, firebase_project_id";
  if (isUuid(appKey)) {
    const { data } = await db.from("apps").select(columns).eq("id", appKey).maybeSingle();
    if (!data) fail("RESOURCE_NOT_FOUND", "Unknown application.");
    return data;
  }
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(appKey)) fail("RESOURCE_NOT_FOUND", "Unknown application.");
  const { data } = await db.from("apps").select(columns).eq("slug", appKey).limit(2);
  if (!data || data.length === 0) fail("RESOURCE_NOT_FOUND", "Unknown application.");
  if (data.length > 1) fail("INVALID_INPUT", "This app slug is ambiguous. Configure the SDK with the app ID.");
  return data[0]!;
}

export async function updateCheck(db: SupabaseClient, input: UpdateCheckInput): Promise<UpdateCheckResult> {
  const app = await resolveApp(db, input.appKey);
  if (app.status === "paused") return { updateAvailable: false, reason: "app_paused" };

  const { data: channel } = await db
    .from("channels")
    .select("id, name, status")
    .eq("app_id", app.id)
    .eq("name", input.channelName)
    .maybeSingle();
  if (!channel) fail("INVALID_CHANNEL", "Unknown channel for this application.");

  await recordInstallation(db, {
    organizationId: app.organization_id as string,
    appId: app.id as string,
    channelId: channel.id as string,
    input,
  });

  await recordEvent(db, {
    organizationId: app.organization_id as string,
    appId: app.id as string,
    channelId: channel.id as string,
    releaseId: null,
    eventType: "update_check",
    input,
  });

  if (channel.status === "paused") return { updateAvailable: false, reason: "channel_paused" };

  // The authoritative target for this device's platform; Android and iOS are independent.
  const { data: target } = await db
    .from("channel_targets")
    .select("release_id, rollout_percentage")
    .eq("channel_id", channel.id)
    .eq("platform", input.platform)
    .maybeSingle();
  if (!target?.release_id) return { updateAvailable: false, reason: "no_release" };

  const { data: release } = await db
    .from("releases")
    .select(
      "id, organization_id, app_id, platform, version, runtime_version, native_version_constraint, status, rollout_percentage, mandatory, release_notes, bundle_hash, bundle_size, storage_path, manifest, signature, signature_key_id, group_id, created_at",
    )
    .eq("id", target.release_id)
    .eq("organization_id", app.organization_id)
    .maybeSingle();

  if (!release || !isServable(release.status as ReleaseState)) return { updateAvailable: false, reason: "no_release" };
  if (!release.bundle_hash || !release.storage_path) return { updateAvailable: false, reason: "no_release" };
  if (release.platform !== input.platform) return { updateAvailable: false, reason: "platform_mismatch" };
  if (input.currentReleaseId && input.currentReleaseId === release.id) {
    return { updateAvailable: false, reason: "up_to_date" };
  }
  if (!runtimeCompatible(input.runtimeVersion, release.runtime_version as string)) {
    return { updateAvailable: false, reason: "runtime_incompatible" };
  }
  if (
    input.nativeVersion &&
    !satisfiesConstraint(input.nativeVersion, (release.native_version_constraint as string) || "*")
  ) {
    return { updateAvailable: false, reason: "native_incompatible" };
  }

  const percentage = Number(target.rollout_percentage ?? 0);
  if (!inRollout(input.installationId, release.id as string, percentage)) {
    return { updateAvailable: false, reason: "not_in_rollout" };
  }

  const bundleUrl = await signedBundleUrl(db, {
    organizationId: app.organization_id as string,
    firebaseProjectId: app.firebase_project_id as string | null,
    storagePath: release.storage_path as string | null,
  });

  await recordEvent(db, {
    organizationId: app.organization_id as string,
    appId: app.id as string,
    channelId: channel.id as string,
    releaseId: release.id as string,
    eventType: "update_available",
    input,
  });

  return {
    updateAvailable: true,
    release: {
      id: release.id as string,
      version: release.version as string,
      runtimeVersion: release.runtime_version as string,
      mandatory: Boolean(release.mandatory),
      notes: (release.release_notes as string) ?? "",
      message: (release.release_notes as string) ?? "",
      groupId: (release.group_id as string | null) ?? null,
      createdAt: release.created_at as string,
      bundle: {
        url: bundleUrl,
        hash: (release.bundle_hash as string) ?? "",
        size: Number(release.bundle_size ?? 0),
      },
      signature: release.signature
        ? {
            value: release.signature as string,
            keyId: (release.signature_key_id as string | null) ?? null,
            algorithm: "rsa-v1_5-sha256",
          }
        : null,
      manifest: release.manifest,
    },
  };
}

async function signedBundleUrl(
  db: SupabaseClient,
  input: { organizationId: string; firebaseProjectId: string | null; storagePath: string | null },
) {
  if (!input.storagePath) fail("STORAGE_ERROR", "This release has no stored bundle.");
  const { data: project } = await db
    .from("firebase_projects")
    .select("storage_bucket")
    .eq("id", input.firebaseProjectId ?? "")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!project?.storage_bucket) fail("FIREBASE_CONNECTION_ERROR", "The app has no connected Firebase storage bucket.");

  // A download token was stored with the artifact at upload time; no Google call is needed here.
  const token = extractDownloadToken(input.storagePath);
  return artifactDownloadUrl(project.storage_bucket as string, stripToken(input.storagePath), token);
}

/** Artifacts are stored as "<path>#<downloadToken>" so device URLs need no extra round trip. */
export function withDownloadToken(path: string, token: string | null) {
  return token ? `${path}#${token}` : path;
}
function extractDownloadToken(path: string) {
  const idx = path.indexOf("#");
  return idx === -1 ? null : path.slice(idx + 1);
}
function stripToken(path: string) {
  const idx = path.indexOf("#");
  return idx === -1 ? path : path.slice(0, idx);
}

async function recordInstallation(
  db: SupabaseClient,
  args: { organizationId: string; appId: string; channelId: string; input: UpdateCheckInput },
) {
  await db.from("device_installations").upsert(
    {
      organization_id: args.organizationId,
      app_id: args.appId,
      channel_id: args.channelId,
      installation_id: args.input.installationId,
      platform: args.input.platform,
      app_version: args.input.appVersion ?? "",
      runtime_version: args.input.runtimeVersion,
      native_version: args.input.nativeVersion ?? "",
      current_release_id: args.input.currentReleaseId ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "app_id,installation_id" },
  );
}

export type OtaEventType =
  | "update_check"
  | "update_available"
  | "download_started"
  | "download_completed"
  | "install_succeeded"
  | "install_failed"
  | "rollback";

export async function recordEvent(
  db: SupabaseClient,
  args: {
    organizationId: string;
    appId: string;
    channelId: string | null;
    releaseId: string | null;
    eventType: OtaEventType | string;
    input: Pick<UpdateCheckInput, "platform" | "installationId" | "runtimeVersion" | "nativeVersion" | "appVersion">;
    metadata?: Record<string, unknown>;
    /** Client generated id; a resubmitted event with the same id is stored once. */
    eventId?: string;
  },
): Promise<boolean> {
  const row = {
    organization_id: args.organizationId,
    app_id: args.appId,
    channel_id: args.channelId,
    release_id: args.releaseId,
    platform: args.input.platform,
    installation_id: args.input.installationId,
    event_type: args.eventType,
    runtime_version: args.input.runtimeVersion,
    native_version: args.input.nativeVersion ?? null,
    app_version: args.input.appVersion ?? null,
    metadata: args.metadata ?? {},
    event_id: args.eventId ?? null,
  };
  if (!args.eventId) {
    const { error } = await db.from("analytics_events").insert(row);
    return !error;
  }
  const { data, error } = await db
    .from("analytics_events")
    .upsert(row, { onConflict: "app_id,event_id", ignoreDuplicates: true })
    .select("id");
  if (error?.code === "42P10") {
    // The (app_id, event_id) unique index is missing (migration 20261012123000 not applied):
    // record the event without de-duplication rather than dropping it.
    const { error: insertError } = await db.from("analytics_events").insert(row);
    return !insertError;
  }
  return !error && (data?.length ?? 0) > 0;
}

const MIN_DEVICES_FOR_AUTO_PAUSE = 25;

/**
 * Automatic safety net: if a published release's failure rate crosses the rollout
 * threshold, pause it and notify the organization. Called after failure telemetry.
 */
export async function evaluateRollbackThreshold(db: SupabaseClient, releaseId: string) {
  const { data: rollout } = await db
    .from("rollouts")
    .select("id, organization_id, release_id, rollback_threshold, status")
    .eq("release_id", releaseId)
    .maybeSingle();
  // Applies to staged and fully rolled-out releases alike; a manually paused rollout is left alone.
  if (!rollout || rollout.status === "paused") return;

  const { data: rows } = await db
    .from("analytics_events")
    .select("event_type, installation_id, created_at")
    .eq("release_id", releaseId)
    .in("event_type", ["install_succeeded", "install_failed"])
    .order("created_at", { ascending: true })
    .limit(20000);

  // Count each device once (its latest outcome) so one device cannot flood the rate.
  const outcome = new Map<string, string>();
  for (const r of rows ?? []) outcome.set(r.installation_id as string, r.event_type as string);
  const total = outcome.size;
  if (total < MIN_DEVICES_FOR_AUTO_PAUSE) return;
  const failed = [...outcome.values()].filter((t) => t === "install_failed").length;
  const failureRate = (failed / total) * 100;
  if (failureRate < Number(rollout.rollback_threshold ?? 2)) return;

  const { data: paused } = await db
    .from("releases")
    .update({ status: "paused" })
    .eq("id", releaseId)
    .eq("status", "published")
    .select("id");
  if (!paused || paused.length === 0) return;
  await db.from("rollouts").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", rollout.id);
  await db.from("notifications").insert({
    organization_id: rollout.organization_id,
    title: "Release paused automatically",
    body: `Install failure rate reached ${failureRate.toFixed(1)}%, above the configured threshold.`,
    tone: "danger",
  });
  await db.from("audit_logs").insert({
    organization_id: rollout.organization_id,
    actor_label: "fireota.system",
    action: "release.auto_paused",
    resource_type: "release",
    resource_id: releaseId,
    app_name: "",
    result: "success",
    after: { failureRate },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
