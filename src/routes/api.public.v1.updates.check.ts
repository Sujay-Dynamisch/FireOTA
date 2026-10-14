/**
 * Device-facing OTA endpoint. Called by the React Native SDK on app start.
 * Public by design (devices hold no credentials) but rate limited per app+install.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { rateLimit } from "@/lib/backend/apikeys.server";
import { clientIp } from "@/lib/backend/client-ip";
import { admin } from "@/lib/backend/context.server";
import { jsonError, jsonOk } from "@/lib/backend/errors";
import { updateCheck } from "@/lib/backend/ota.server";

const schema = z.object({
  app: z.string().min(1).max(80),
  channel: z.string().min(1).max(40).default("production"),
  platform: z.enum(["android", "ios"]),
  installationId: z.string().min(8).max(120),
  runtimeVersion: z.string().min(1).max(40),
  nativeVersion: z.string().max(40).optional(),
  appVersion: z.string().max(40).optional(),
  currentReleaseId: z.string().max(64).nullable().optional(),
});

export const Route = createFileRoute("/api/public/v1/updates/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const body = schema.parse(await request.json());
          const db = await admin();
          await rateLimit(db, `ota-ip:${clientIp(request)}`, 3000, 60);
          await rateLimit(db, `ota:${body.app}:${body.installationId}`, 60, 60);

          const result = await updateCheck(db, {
            appKey: body.app,
            channelName: body.channel,
            platform: body.platform,
            installationId: body.installationId,
            runtimeVersion: body.runtimeVersion,
            ...(body.nativeVersion ? { nativeVersion: body.nativeVersion } : {}),
            ...(body.appVersion ? { appVersion: body.appVersion } : {}),
            currentReleaseId: body.currentReleaseId ?? null,
          });

          return jsonOk(result, {
            headers: {
              "cache-control": "private, no-store",
              "x-request-id": requestId,
            },
          });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
