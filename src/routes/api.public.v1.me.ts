/**
 * GET /api/public/v1/me — identifies the workspace and scopes behind an API key.
 * Used by `fireota whoami` and CI pipelines to fail fast on a wrong or weak key.
 */
import { createFileRoute } from "@tanstack/react-router";

import { contextFromApiKey, rateLimit } from "@/lib/backend/apikeys.server";
import { jsonError, jsonOk } from "@/lib/backend/errors";

export const Route = createFileRoute("/api/public/v1/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const ctx = await contextFromApiKey(request);
          await rateLimit(ctx.db, `api:${ctx.organizationId}`, 300, 60);
          const { data: apps } = await ctx.db
            .from("apps")
            .select("id, name, slug, runtime_version, code_signing_required")
            .eq("organization_id", ctx.organizationId);
          return jsonOk(
            {
              organization: {
                id: ctx.organizationId,
                name: ctx.organizationName,
                slug: ctx.organizationSlug ?? "",
              },
              key: { label: ctx.actorLabel, role: ctx.role },
              apps: (apps ?? []).map((a) => ({
                id: a.id,
                name: a.name,
                slug: a.slug,
                runtimeVersion: a.runtime_version,
                requiresSignedUpdates: Boolean(a.code_signing_required),
              })),
            },
            { headers: { "x-request-id": requestId, "cache-control": "private, no-store" } },
          );
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
