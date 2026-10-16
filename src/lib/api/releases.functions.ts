/** Releases, rollouts and analytics server functions for the dashboard. */
import { createServerFn } from "@tanstack/react-start";
import { fetchAllRows } from "@/lib/backend/paging";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orgContextForUser, requirePermission, type OrgContext } from "@/lib/backend/context.server";
import { fail } from "@/lib/backend/errors";
import {
  archiveRelease,
  createRelease,
  deleteRelease,
  loadRelease,
  pauseRelease,
  promoteRelease,
  publishRelease,
  rollbackRelease,
  setRolloutPercentage,
  RELEASE_COLUMNS,
} from "@/lib/backend/releases.server";

function bytes(size: number | null | undefined) {
  const value = Number(size ?? 0);
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

const stamp = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 16).replace("T", " ") : null);

interface ReleaseMetrics {
  totalDevices: number;
  eligibleDevices: number;
  updated: number;
  pending: number;
  failed: number;
  successRate: number;
  adoption: number;
  rollbackRate: number;
}

async function metricsFor(ctx: OrgContext, releaseIds: string[]): Promise<Map<string, ReleaseMetrics>> {
  const map = new Map<string, ReleaseMetrics>();
  if (releaseIds.length === 0) return map;
  const { data: events } = await ctx.db
    .from("analytics_events")
    .select("release_id, event_type, installation_id")
    .in("release_id", releaseIds)
    .limit(50000);
  const { data: devices } = await ctx.db
    .from("device_installations")
    .select("app_id, current_release_id")
    .eq("organization_id", ctx.organizationId);

  for (const id of releaseIds) {
    const rows = (events ?? []).filter((e) => e.release_id === id);
    const updated = rows.filter((r) => r.event_type === "install_succeeded").length;
    const failed = rows.filter((r) => r.event_type === "install_failed").length;
    const rollbacks = rows.filter((r) => r.event_type === "rollback").length;
    const eligible = new Set(rows.filter((r) => r.event_type === "update_available").map((r) => r.installation_id)).size;
    const total = (devices ?? []).length;
    map.set(id, {
      totalDevices: total,
      eligibleDevices: eligible,
      updated,
      pending: Math.max(eligible - updated - failed, 0),
      failed,
      successRate: updated + failed > 0 ? Number(((updated / (updated + failed)) * 100).toFixed(1)) : 0,
      adoption: eligible > 0 ? Number(((updated / eligible) * 100).toFixed(0)) : 0,
      rollbackRate: updated > 0 ? Number(((rollbacks / updated) * 100).toFixed(2)) : 0,
    });
  }
  return map;
}

async function shapeReleases(
  ctx: OrgContext,
  filters?: { appId?: string; platform?: string; channel?: string; status?: string; search?: string; id?: string },
) {
  let query = ctx.db.from("releases").select(RELEASE_COLUMNS).eq("organization_id", ctx.organizationId).neq("status", "deleted");
  if (filters?.id) query = query.eq("id", filters.id);
  if (filters?.appId) query = query.eq("app_id", filters.appId);
  if (filters?.platform) query = query.eq("platform", filters.platform);
  if (filters?.status) query = query.eq("status", filters.status);

  const [{ data: rows }, { data: apps }, { data: channels }, { data: assets }] = await Promise.all([
    query.order("number", { ascending: false }).limit(500),
    ctx.db.from("apps").select("id, name").eq("organization_id", ctx.organizationId),
    ctx.db.from("channels").select("id, name").eq("organization_id", ctx.organizationId),
    ctx.db.from("release_assets").select("release_id, kind, size_bytes, hash, path, status").eq("organization_id", ctx.organizationId),
  ]);

  let releases = rows ?? [];
  if (filters?.channel) {
    const channelIds = (channels ?? []).filter((c) => c.name === filters.channel).map((c) => c.id);
    releases = releases.filter((r) => channelIds.includes(r.channel_id));
  }
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    const appName = (id: string) => (apps ?? []).find((a) => a.id === id)?.name?.toLowerCase() ?? "";
    releases = releases.filter(
      (r) =>
        String(r.number).includes(term) ||
        (r.id as string).startsWith(term) ||
        ((r.version as string) ?? "").toLowerCase().includes(term) ||
        ((r.release_notes as string) ?? "").toLowerCase().includes(term) ||
        appName(r.app_id as string).includes(term) ||
        ((r.created_by_label as string) ?? "").toLowerCase().includes(term),
    );
  }

  const metrics = await metricsFor(ctx, releases.map((r) => r.id as string));

  return releases.map((r) => {
    const releaseAssets = (assets ?? []).filter((a) => a.release_id === r.id);
    const channelName = (channels ?? []).find((c) => c.id === r.channel_id)?.name ?? "";
    return {
      id: r.id as string,
      number: Number(r.number),
      appId: r.app_id as string,
      appName: (apps ?? []).find((a) => a.id === r.app_id)?.name ?? "",
      platform: r.platform as "android" | "ios",
      channelId: (r.channel_id as string) ?? "",
      channelName,
      environment: r.environment as "production" | "beta" | "staging" | "development",
      version: (r.version as string) ?? "",
      shortId: (r.id as string).slice(0, 8),
      groupId: (r.group_id as string | null) ?? null,
      signed: Boolean(r.signature),
      signatureKeyId: (r.signature_key_id as string | null) ?? null,
      runtimeVersion: r.runtime_version as string,
      nativeCompatibility: (r.native_version_constraint as string) ?? "*",
      status: r.status as never,
      rollout: Number(r.rollout_percentage ?? 0),
      mandatory: Boolean(r.mandatory),
      bundleSize: bytes(r.bundle_size as number | null),
      compressedSize: bytes(r.compressed_size as number | null),
      checksum: (r.bundle_hash as string) ?? "",
      notes: (r.release_notes as string) ?? "",
      gitCommit: (r.git_commit_sha as string) ?? "",
      gitBranch: (r.git_branch as string) ?? "",
      buildNumber: (r.build_number as string) ?? "",
      createdBy: (r.created_by_label as string) ?? "",
      createdAt: stamp(r.created_at as string) ?? "",
      publishedAt: stamp(r.published_at as string | null),
      artifacts: releaseAssets.map((a) => ({
        kind: a.kind as "bundle" | "assets" | "sourcemap" | "manifest",
        size: bytes(a.size_bytes as number | null),
        hash: ((a.hash as string) ?? "").slice(0, 16),
        path: (a.path as string) ?? "",
        status: a.status as "stored" | "missing" | "processing",
      })),
      timeline: [
        { label: "Created", at: stamp(r.created_at as string), state: "done" as const },
        {
          label: "Bundle stored",
          at: r.bundle_hash ? stamp(r.created_at as string) : null,
          state: r.bundle_hash ? ("done" as const) : ("pending" as const),
        },
        {
          label: "Published",
          at: stamp(r.published_at as string | null),
          state: r.published_at ? ("done" as const) : r.status === "failed" ? ("failed" as const) : ("pending" as const),
        },
        {
          label: "Rollout",
          at: r.status === "published" ? stamp(r.published_at as string | null) : null,
          state: r.status === "published" ? ("active" as const) : ("pending" as const),
        },
      ],
      metrics:
        metrics.get(r.id as string) ??
        {
          totalDevices: 0,
          eligibleDevices: 0,
          updated: 0,
          pending: 0,
          failed: 0,
          successRate: 0,
          adoption: 0,
          rollbackRate: 0,
        },
    };
  });
}

export const listReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { appId?: string; platform?: string; channel?: string; status?: string; search?: string } | undefined) =>
    z
      .object({
        appId: z.string().uuid().optional(),
        platform: z.enum(["android", "ios"]).optional(),
        channel: z.string().max(40).optional(),
        status: z.string().max(24).optional(),
        search: z.string().max(80).optional(),
      })
      .optional()
      .parse(input ?? undefined),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "release.read");
    return shapeReleases(ctx, (data ?? undefined) as never);
  });

export const getRelease = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "release.read");
    const row = await loadRelease(ctx, data.id);
    const [shaped] = await shapeReleases(ctx, { id: row.id });
    if (!shaped) fail("RESOURCE_NOT_FOUND", "Release not found.");
    return shaped;
  });

export const createReleaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      appId: string;
      channelName: string;
      platform: "android" | "ios";
      version?: string;
      runtimeVersion: string;
      nativeVersionConstraint?: string;
      releaseNotes?: string;
      mandatory?: boolean;
      gitCommitSha?: string;
      gitBranch?: string;
      buildNumber?: string;
    }) =>
      z
        .object({
          appId: z.string().uuid(),
          channelName: z.string().min(1).max(40),
          platform: z.enum(["android", "ios"]),
          version: z.string().max(40).optional(),
          runtimeVersion: z.string().min(1).max(40),
          nativeVersionConstraint: z.string().max(60).optional(),
          releaseNotes: z.string().max(4000).optional(),
          mandatory: z.boolean().optional(),
          gitCommitSha: z.string().max(64).optional(),
          gitBranch: z.string().max(120).optional(),
          buildNumber: z.string().max(40).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    const row = await createRelease(ctx, data as never);
    return { id: row.id, number: row.number, status: row.status };
  });

export const publishReleaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { releaseId: string; rolloutPercentage: number }) =>
    z.object({ releaseId: z.string().uuid(), rolloutPercentage: z.number().min(0).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => publishRelease(await orgContextForUser(context.userId), data));

export const pauseReleaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { releaseId: string }) => z.object({ releaseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => pauseRelease(await orgContextForUser(context.userId), data));

export const rollbackReleaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { releaseId: string; reason: string; targetReleaseId?: string }) =>
    z
      .object({
        releaseId: z.string().uuid(),
        reason: z.string().min(3).max(500),
        targetReleaseId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => rollbackRelease(await orgContextForUser(context.userId), data));

export const archiveReleaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { releaseId: string }) => z.object({ releaseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => archiveRelease(await orgContextForUser(context.userId), data));

export const deleteReleaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { releaseId: string }) => z.object({ releaseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => deleteRelease(await orgContextForUser(context.userId), data));

export const setReleaseRollout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { releaseId: string; percentage: number }) =>
    z.object({ releaseId: z.string().uuid(), percentage: z.number().min(0).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => setRolloutPercentage(await orgContextForUser(context.userId), data));

export const promoteReleaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { releaseId: string; channelName: string; rolloutPercentage?: number }) =>
    z
      .object({
        releaseId: z.string().uuid(),
        channelName: z.string().min(1).max(40),
        rolloutPercentage: z.number().min(0).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => promoteRelease(await orgContextForUser(context.userId), data as never));

async function shapeRollouts(ctx: OrgContext, id?: string) {
  let query = ctx.db
    .from("rollouts")
    .select("id, app_id, release_id, channel_id, current_percentage, target_percentage, rollback_threshold, status, started_at")
    .eq("organization_id", ctx.organizationId);
  if (id) query = query.eq("id", id);

  const [{ data: rollouts }, { data: apps }, { data: channels }, { data: releases }] = await Promise.all([
    query.order("started_at", { ascending: false }),
    ctx.db.from("apps").select("id, name").eq("organization_id", ctx.organizationId),
    ctx.db.from("channels").select("id, name, environment").eq("organization_id", ctx.organizationId),
    ctx.db.from("releases").select("id, number, version, platform, status").eq("organization_id", ctx.organizationId),
  ]);

  // Hide rollouts whose release was deleted (legacy soft-deleted rows).
  const visible = (rollouts ?? []).filter((r) =>
    (releases ?? []).some((x) => x.id === r.release_id && x.status !== "deleted"),
  );
  const metrics = await metricsFor(ctx, visible.map((r) => r.release_id as string));

  return visible.map((r) => {
    const release = (releases ?? []).find((x) => x.id === r.release_id);
    const channel = (channels ?? []).find((c) => c.id === r.channel_id);
    const m = metrics.get(r.release_id as string);
    return {
      id: r.id as string,
      appName: (apps ?? []).find((a) => a.id === r.app_id)?.name ?? "",
      releaseId: r.release_id as string,
      releaseLabel: release ? `#${release.number}${release.version ? ` (${release.version})` : ""}` : "—",
      channelName: channel?.name ?? "",
      environment: (channel?.environment ?? "production") as "production" | "beta" | "staging" | "development",
      platform: (release?.platform ?? "android") as "android" | "ios",
      current: Number(r.current_percentage ?? 0),
      target: Number(r.target_percentage ?? 100),
      devices: m?.eligibleDevices ?? 0,
      adoption: m?.adoption ?? 0,
      successRate: m?.successRate ?? 0,
      failures: m?.failed ?? 0,
      rollbackThreshold: Number(r.rollback_threshold ?? 2),
      status: r.status as "active" | "paused" | "completed",
      startedAt: stamp(r.started_at as string) ?? "",
    };
  });
}

export const listRollouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "rollout.read");
    return shapeRollouts(ctx);
  });

export const getRollout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "rollout.read");
    const [found] = await shapeRollouts(ctx, data.id);
    if (!found) fail("RESOURCE_NOT_FOUND", "Rollout not found.");
    return found;
  });

export const setRolloutState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; action: "pause" | "resume" | "percentage"; percentage?: number }) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["pause", "resume", "percentage"]),
        percentage: z.number().min(0).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "rollout.update");
    const { data: rollout } = await ctx.db
      .from("rollouts")
      .select("id, release_id, status")
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!rollout) fail("RESOURCE_NOT_FOUND", "Rollout not found.");

    if (data.action === "pause") {
      await pauseRelease(ctx, { releaseId: rollout.release_id as string });
      return { id: data.id, status: "paused" as const };
    }
    if (data.action === "resume") {
      const { resumeRelease } = await import("@/lib/backend/releases.server");
      await resumeRelease(ctx, { releaseId: rollout.release_id as string });
      return { id: data.id, status: "active" as const };
    }
    const result = await setRolloutPercentage(ctx, {
      releaseId: rollout.release_id as string,
      percentage: data.percentage ?? 0,
    });
    return { id: data.id, current: result.rollout };
  });

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { appId?: string; days?: number } | undefined) =>
    z.object({ appId: z.string().uuid().optional(), days: z.number().min(1).max(90).optional() }).optional().parse(input ?? undefined),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "analytics.read");
    const days = data?.days ?? 14;
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const eventsPage = (from: number, to: number) => {
      let q = ctx.db
        .from("analytics_events")
        .select("event_type, platform, created_at, release_id")
        .eq("organization_id", ctx.organizationId)
        .gte("created_at", since)
        .order("id")
        .range(from, to);
      if (data?.appId) q = q.eq("app_id", data.appId);
      return q;
    };
    const devicesPage = (from: number, to: number) => {
      let q = ctx.db
        .from("device_installations")
        .select("platform, current_release_id")
        .eq("organization_id", ctx.organizationId)
        .order("id")
        .range(from, to);
      if (data?.appId) q = q.eq("app_id", data.appId);
      return q;
    };

    const [rows, devices, { data: releases }] = await Promise.all([
      fetchAllRows<{ event_type: string; platform: string; created_at: string; release_id: string | null }>(eventsPage),
      fetchAllRows<{ platform: string; current_release_id: string | null }>(devicesPage),
      ctx.db.from("releases").select("id, version").eq("organization_id", ctx.organizationId),
    ]);

    const all = rows;
    const count = (type: string) => all.filter((r) => r.event_type === type).length;
    const successfulInstalls = count("install_succeeded");
    const failedInstalls = count("install_failed");
    const updateChecks = count("update_check");

    const byDay = new Map<string, { updated: number; failed: number; checks: number }>();
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 86400_000).toISOString().slice(5, 10);
      byDay.set(day, { updated: 0, failed: 0, checks: 0 });
    }
    for (const row of all) {
      const day = new Date(row.created_at as string).toISOString().slice(5, 10);
      const bucket = byDay.get(day);
      if (!bucket) continue;
      if (row.event_type === "install_succeeded") bucket.updated += 1;
      if (row.event_type === "install_failed") bucket.failed += 1;
      if (row.event_type === "update_check") bucket.checks += 1;
    }

    const versionCounts = new Map<string, number>();
    for (const device of devices ?? []) {
      // Devices without an OTA release are still running the bundle shipped in the store binary.
      const version = (releases ?? []).find((r) => r.id === device.current_release_id)?.version ?? "store";
      versionCounts.set(version, (versionCounts.get(version) ?? 0) + 1);
    }

    return {
      updateChecks,
      updatesAvailable: count("update_available"),
      downloads: count("download_completed"),
      successfulInstalls,
      failedInstalls,
      rollbacks: count("rollback"),
      adoption:
        (devices ?? []).length > 0
          ? Number((((devices ?? []).filter((d) => d.current_release_id).length / (devices ?? []).length) * 100).toFixed(0))
          : 0,
      adoptionSeries: [...byDay.entries()].map(([day, v]) => ({
        day,
        adoption: v.checks > 0 ? Math.min(100, Number(((v.updated / v.checks) * 100).toFixed(0))) : 0,
        failures: v.failed,
      })),
      versionDistribution: [...versionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([version, count]) => ({ version, devices: count })),
      platformDistribution: ["android", "ios"].map((platform) => ({
        platform,
        devices: (devices ?? []).filter((d) => d.platform === platform).length,
      })),
    };
  });

export const resumeReleaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { releaseId: string }) => z.object({ releaseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { resumeRelease } = await import("@/lib/backend/releases.server");
    return resumeRelease(await orgContextForUser(context.userId), data);
  });
