/** Publish / pause / rollback / change rollout of a release from CI (API key). */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { contextFromApiKey, rateLimit } from "@/lib/backend/apikeys.server";
import { ApiError, jsonError, jsonOk } from "@/lib/backend/errors";
import { ROLE_PERMISSIONS } from "@/lib/backend/rbac";
import {
  archiveRelease,
  pauseRelease,
  promoteRelease,
  publishRelease,
  resumeRelease,
  rollbackRelease,
  setRolloutPercentage,
} from "@/lib/backend/releases.server";

const schema = z.object({
  action: z.enum(["publish", "pause", "rollback", "rollout", "resume", "promote", "archive"]).default("publish"),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  reason: z.string().max(500).optional(),
  targetReleaseId: z.string().uuid().optional(),
  channel: z.string().min(1).max(40).optional(),
  branch: z.string().min(1).max(40).optional(),
});

export const Route = createFileRoute("/api/public/v1/releases/$releaseId/publish")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const raw = await request.text();
          const body = schema.parse(raw ? JSON.parse(raw) : {});
          const requiredScope =
            body.action === "rollout"
              ? "rollout.write"
              : body.action === "archive"
                ? "release.write"
                : "release.publish";
          const ctx = await contextFromApiKey(request, requiredScope);
          await rateLimit(ctx.db, `api:${ctx.organizationId}`, 300, 60);

          if (body.action === "rollout") {
            if (body.rolloutPercentage === undefined) throw new ApiError("INVALID_INPUT", "rolloutPercentage is required.");
            return jsonOk(await setRolloutPercentage(ctx, { releaseId: params.releaseId, percentage: body.rolloutPercentage }), {
              headers: { "x-request-id": requestId },
            });
          }

          if (body.action === "pause") {
            return jsonOk(await pauseRelease(ctx, { releaseId: params.releaseId }), { headers: { "x-request-id": requestId } });
          }
          if (body.action === "resume") {
            return jsonOk(await resumeRelease(ctx, { releaseId: params.releaseId }), { headers: { "x-request-id": requestId } });
          }
          if (body.action === "archive") {
            ctx.permissions = [...(ctx.permissions ?? ROLE_PERMISSIONS[ctx.role]), "release.archive"];
            return jsonOk(await archiveRelease(ctx, { releaseId: params.releaseId }), { headers: { "x-request-id": requestId } });
          }
          if (body.action === "promote") {
            const channelName = body.channel ?? body.branch;
            if (!channelName) throw new ApiError("INVALID_INPUT", "channel is required.");
            return jsonOk(
              await promoteRelease(ctx, {
                releaseId: params.releaseId,
                channelName,
                ...(body.rolloutPercentage !== undefined ? { rolloutPercentage: body.rolloutPercentage } : {}),
              }),
              { headers: { "x-request-id": requestId } },
            );
          }
          if (body.action === "rollback") {
            return jsonOk(
              await rollbackRelease(ctx, {
                releaseId: params.releaseId,
                reason: body.reason ?? "Rollback requested from CI",
                targetReleaseId: body.targetReleaseId ?? null,
              }),
              { headers: { "x-request-id": requestId } },
            );
          }
          return jsonOk(
            await publishRelease(ctx, { releaseId: params.releaseId, rolloutPercentage: body.rolloutPercentage ?? 100 }),
            { headers: { "x-request-id": requestId } },
          );
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
