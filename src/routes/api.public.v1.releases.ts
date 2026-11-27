/**
 * CI/CD release API. Authenticated with a FireOTA API key:
 *   POST /api/public/v1/releases   create a draft release
 *   GET  /api/public/v1/releases   list releases
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { contextFromApiKey, rateLimit } from "@/lib/backend/apikeys.server";
import { jsonError, jsonOk } from "@/lib/backend/errors";
import { createRelease } from "@/lib/backend/releases.server";
import { isSafeExternalUrl } from "@/lib/backend/url-safety";

const createSchema = z.object({
  appId: z.string().uuid(),
  channel: z.string().min(1).max(40),
  platform: z.enum(["android", "ios"]),
  /** Optional human label. Updates are identified by their UUID (Expo-style). */
  version: z.string().max(40).optional(),
  /** Shared by the Android and iOS updates built from the same bundle. */
  groupId: z.string().uuid().optional(),
  runtimeVersion: z.string().min(1).max(40),
  nativeVersionConstraint: z.string().max(60).optional(),
  releaseNotes: z.string().max(4000).optional(),
  mandatory: z.boolean().optional(),
  gitCommitSha: z.string().max(64).optional(),
  gitBranch: z.string().max(120).optional(),
  buildNumber: z.string().max(40).optional(),
  externalBundle: z
    .object({
      url: z.string().url().refine(isSafeExternalUrl, "URL must be https and cannot point to private or internal hosts"),
      sha256: z.string().length(64),
      size: z.number().positive(),
    })
    .optional(),
});

export const Route = createFileRoute("/api/public/v1/releases")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const ctx = await contextFromApiKey(request, "release.read");
          await rateLimit(ctx.db, `api:${ctx.organizationId}`, 300, 60);
          const url = new URL(request.url);
          let query = ctx.db
            .from("releases")
            .select("id, number, app_id, channel_id, platform, version, group_id, runtime_version, status, rollout_percentage, release_notes, published_at")
            .eq("organization_id", ctx.organizationId)
            .neq("status", "deleted")
            .order("number", { ascending: false })
            .limit(Math.min(Number(url.searchParams.get("limit") ?? 50), 200));

          const appId = url.searchParams.get("appId");
          if (appId) query = query.eq("app_id", appId);

          const channelParam = url.searchParams.get("channel") ?? url.searchParams.get("branch");
          if (channelParam) {
            let channelQuery = ctx.db
              .from("channels")
              .select("id")
              .eq("organization_id", ctx.organizationId)
              .eq("name", channelParam);
            if (appId) channelQuery = channelQuery.eq("app_id", appId);
            const { data: channelRows } = await channelQuery;
            const channelIds = (channelRows ?? []).map((c) => c.id);
            if (channelIds.length === 0) {
              return jsonOk([], { headers: { "x-request-id": requestId, "cache-control": "private, no-store" } });
            }
            query = query.in("channel_id", channelIds);
          }

          const platform = url.searchParams.get("platform");
          if (platform) query = query.eq("platform", platform);

          const groupId = url.searchParams.get("groupId") ?? url.searchParams.get("group_id");
          if (groupId) query = query.eq("group_id", groupId);

          const runtimeVersion = url.searchParams.get("runtimeVersion") ?? url.searchParams.get("runtime_version");
          if (runtimeVersion) query = query.eq("runtime_version", runtimeVersion);

          const { data } = await query;
          const releases = data ?? [];

          const channelIds = [...new Set(releases.map((r) => r.channel_id).filter((id): id is string => Boolean(id)))];
          const channelMap = new Map<string, string>();
          if (channelIds.length > 0) {
            const { data: channels } = await ctx.db
              .from("channels")
              .select("id, name")
              .in("id", channelIds);
            for (const ch of channels ?? []) {
              channelMap.set(ch.id, ch.name);
            }
          }

          const results = releases.map((row) => ({
            ...row,
            channel: (row.channel_id ? channelMap.get(row.channel_id) : null) ?? null,
            message: row.release_notes,
          }));

          return jsonOk(results, { headers: { "x-request-id": requestId, "cache-control": "private, no-store" } });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
      POST: async ({ request }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const ctx = await contextFromApiKey(request, "release.write");
          await rateLimit(ctx.db, `api:${ctx.organizationId}`, 300, 60);
          const body = createSchema.parse(await request.json());
          const idempotencyKey = request.headers.get("idempotency-key");
          const release = await createRelease(ctx, {
            appId: body.appId,
            channelName: body.channel,
            platform: body.platform,
            ...(body.version ? { version: body.version } : {}),
            ...(body.groupId ? { groupId: body.groupId } : {}),
            runtimeVersion: body.runtimeVersion,
            ...(body.nativeVersionConstraint ? { nativeVersionConstraint: body.nativeVersionConstraint } : {}),
            ...(body.releaseNotes ? { releaseNotes: body.releaseNotes } : {}),
            ...(body.mandatory !== undefined ? { mandatory: body.mandatory } : {}),
            ...(body.gitCommitSha ? { gitCommitSha: body.gitCommitSha } : {}),
            ...(body.gitBranch ? { gitBranch: body.gitBranch } : {}),
            ...(body.buildNumber ? { buildNumber: body.buildNumber } : {}),
            ...(body.externalBundle ? { externalBundle: body.externalBundle } : {}),
            ...(idempotencyKey ? { idempotencyKey } : {}),
          });
          return jsonOk(
            { id: release.id, number: release.number, status: release.status, groupId: release.group_id },
            { status: 201, headers: { "x-request-id": requestId } },
          );
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
