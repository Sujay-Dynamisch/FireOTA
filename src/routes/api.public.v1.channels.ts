/**
 * Channel management API. Authenticated with a FireOTA API key:
 *   GET  /api/public/v1/channels?appId=<uuid|slug>
 *   POST /api/public/v1/channels {appId, name, environment?}
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { contextFromApiKey, rateLimit } from "@/lib/backend/apikeys.server";
import { createChannel, type ChannelEnvironment } from "@/lib/backend/channels.server";
import type { OrgContext } from "@/lib/backend/context.server";
import { fail, jsonError, jsonOk } from "@/lib/backend/errors";
import { ROLE_PERMISSIONS } from "@/lib/backend/rbac";

const postSchema = z.object({
  appId: z.string().min(1),
  name: z.string().min(1).max(40),
  environment: z.enum(["production", "beta", "staging", "development"]).optional(),
});

async function resolveApp(ctx: OrgContext, appKey: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(appKey);
  let query = ctx.db
    .from("apps")
    .select("id, name, slug")
    .eq("organization_id", ctx.organizationId);
  if (isUuid) {
    query = query.eq("id", appKey);
  } else {
    query = query.eq("slug", appKey);
  }
  const { data } = await query.maybeSingle();
  if (!data) fail("RESOURCE_NOT_FOUND", "Application not found.");
  return data;
}

export const Route = createFileRoute("/api/public/v1/channels")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const ctx = await contextFromApiKey(request, "release.read");
          await rateLimit(ctx.db, `api:${ctx.organizationId}`, 300, 60);

          const url = new URL(request.url);
          const appParam = url.searchParams.get("appId");
          let targetAppId: string | null = null;
          if (appParam) {
            const app = await resolveApp(ctx, appParam);
            targetAppId = app.id;
          }

          let channelsQuery = ctx.db
            .from("channels")
            .select("id, app_id, name, environment, active_release_id")
            .eq("organization_id", ctx.organizationId)
            .order("created_at", { ascending: true });

          if (targetAppId) {
            channelsQuery = channelsQuery.eq("app_id", targetAppId);
          }

          const { data: channels } = await channelsQuery;
          const channelRows = channels ?? [];

          let releasesQuery = ctx.db
            .from("releases")
            .select("id, number, platform, status, rollout_percentage, published_at, channel_id")
            .eq("organization_id", ctx.organizationId)
            .eq("status", "published")
            .order("published_at", { ascending: false })
            .order("number", { ascending: false });

          if (targetAppId) {
            releasesQuery = releasesQuery.eq("app_id", targetAppId);
          }

          const { data: releases } = await releasesQuery;
          const releaseRows = releases ?? [];

          const activeReleaseIds = channelRows
            .map((c) => c.active_release_id)
            .filter((id): id is string => Boolean(id));

          const releaseById = new Map<string, (typeof releaseRows)[number]>();
          for (const r of releaseRows) {
            releaseById.set(r.id, r);
          }

          const missingIds = activeReleaseIds.filter((id) => !releaseById.has(id));
          if (missingIds.length > 0) {
            const { data: extraReleases } = await ctx.db
              .from("releases")
              .select("id, number, platform, status, rollout_percentage, published_at, channel_id")
              .eq("organization_id", ctx.organizationId)
              .in("id", missingIds);
            for (const r of extraReleases ?? []) {
              releaseById.set(r.id, r);
            }
          }

          const latestReleaseByChannel = new Map<string, (typeof releaseRows)[number]>();
          for (const r of releaseRows) {
            if (r.channel_id && !latestReleaseByChannel.has(r.channel_id)) {
              latestReleaseByChannel.set(r.channel_id, r);
            }
          }

          const result = channelRows.map((c) => {
            const latest =
              (c.active_release_id ? releaseById.get(c.active_release_id) : null) ??
              latestReleaseByChannel.get(c.id) ??
              null;
            return {
              id: c.id,
              name: c.name,
              environment: c.environment,
              appId: c.app_id,
              latestRelease: latest
                ? {
                    id: latest.id,
                    number: latest.number,
                    platform: latest.platform,
                    status: latest.status,
                    rolloutPercentage: latest.rollout_percentage,
                    publishedAt: latest.published_at,
                  }
                : null,
            };
          });

          return jsonOk(result, { headers: { "x-request-id": requestId, "cache-control": "private, no-store" } });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
      POST: async ({ request }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const ctx = await contextFromApiKey(request, "release.write");
          await rateLimit(ctx.db, `api:${ctx.organizationId}`, 300, 60);

          const body = postSchema.parse(await request.json());
          const app = await resolveApp(ctx, body.appId);
          const environment: ChannelEnvironment =
            body.environment ??
            (["production", "beta", "staging", "development"].includes(body.name)
              ? (body.name as ChannelEnvironment)
              : "development");

          ctx.permissions = [...(ctx.permissions ?? ROLE_PERMISSIONS[ctx.role]), "channel.create"];
          const channel = await createChannel(ctx, {
            appId: app.id,
            name: body.name,
            environment,
          });

          return jsonOk(channel, { status: 201, headers: { "x-request-id": requestId } });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
