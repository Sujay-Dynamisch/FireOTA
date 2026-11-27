/**
 * Release details and deletion API. Authenticated with a FireOTA API key:
 *   GET    /api/public/v1/releases/:releaseId
 *   DELETE /api/public/v1/releases/:releaseId
 */
import { createFileRoute } from "@tanstack/react-router";

import { contextFromApiKey, rateLimit } from "@/lib/backend/apikeys.server";
import { jsonError, jsonOk } from "@/lib/backend/errors";
import { ROLE_PERMISSIONS } from "@/lib/backend/rbac";
import { deleteRelease, loadRelease } from "@/lib/backend/releases.server";

export const Route = createFileRoute("/api/public/v1/releases/$releaseId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const ctx = await contextFromApiKey(request, "release.read");
          await rateLimit(ctx.db, `api:${ctx.organizationId}`, 300, 60);

          const release = await loadRelease(ctx, params.releaseId);

          let channelName: string | null = null;
          if (release.channel_id) {
            const { data: channel } = await ctx.db
              .from("channels")
              .select("name")
              .eq("id", release.channel_id)
              .maybeSingle();
            channelName = channel?.name ?? null;
          }

          const result = {
            ...release,
            channel: channelName,
            message: release.release_notes,
            bundle: {
              size: release.bundle_size,
              hash: release.bundle_hash,
            },
            signed: Boolean(release.signature),
            mandatory: release.mandatory,
            created_at: release.created_at,
          };

          return jsonOk(result, { headers: { "x-request-id": requestId, "cache-control": "private, no-store" } });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
      DELETE: async ({ request, params }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const ctx = await contextFromApiKey(request, "release.write");
          await rateLimit(ctx.db, `api:${ctx.organizationId}`, 300, 60);
          ctx.permissions = [...(ctx.permissions ?? ROLE_PERMISSIONS[ctx.role]), "release.delete"];

          const result = await deleteRelease(ctx, { releaseId: params.releaseId });
          return jsonOk(result, { headers: { "x-request-id": requestId } });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
