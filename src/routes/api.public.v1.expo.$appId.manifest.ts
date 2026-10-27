/**
 * Expo Updates protocol endpoint. Apps using `expo-updates` set
 *   updates.url = https://<fireota>/api/public/v1/expo/<appId>/manifest
 *   updates.requestHeaders = { "expo-channel-name": "production" }
 * and get FireOTA channels, rollouts and rollback without EAS Update. Bundles and
 * assets download straight from the customer's Firebase Storage.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { rateLimit } from "@/lib/backend/apikeys.server";
import { clientIp } from "@/lib/backend/client-ip";
import { admin } from "@/lib/backend/context.server";
import { sha256Hex } from "@/lib/backend/crypto.server";
import { jsonError } from "@/lib/backend/errors";
import { EXPO_RESPONSE_HEADERS, expoManifest, expoMultipart, type ExpoManifestTemplate } from "@/lib/backend/expo";
import { recordEvent, resolveApp, updateCheck } from "@/lib/backend/ota.server";

const headersSchema = z.object({
  platform: z.enum(["android", "ios"]),
  runtimeVersion: z.string().min(1).max(40),
  channel: z.string().min(1).max(40),
  protocol: z.enum(["0", "1"]),
  currentUpdateId: z.string().uuid().nullable(),
  embeddedUpdateId: z.string().uuid().nullable(),
  clientId: z.string().min(8).max(120).nullable(),
});

const UUID = z.string().uuid();
const uuidOrNull = (value: string | null) => (value && UUID.safeParse(value).success ? value : null);

export const Route = createFileRoute("/api/public/v1/expo/$appId/manifest")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const h = request.headers;
          const parsed = headersSchema.parse({
            platform: h.get("expo-platform") ?? new URL(request.url).searchParams.get("platform"),
            runtimeVersion: h.get("expo-runtime-version") ?? new URL(request.url).searchParams.get("runtime-version"),
            channel: h.get("expo-channel-name") || "production",
            protocol: h.get("expo-protocol-version") ?? "0",
            currentUpdateId: uuidOrNull(h.get("expo-current-update-id")),
            embeddedUpdateId: uuidOrNull(h.get("expo-embedded-update-id")),
            clientId: h.get("eas-client-id"),
          });
          const ip = clientIp(request);
          // expo-updates sends a stable per-install EAS-Client-ID; without it, fall back to the network.
          const installationId = parsed.clientId ?? `anon-${sha256Hex(`${ip}|${h.get("user-agent") ?? ""}`).slice(0, 32)}`;
          // A device on its embedded (store) bundle is not running any FireOTA release.
          const runningRelease =
            parsed.currentUpdateId && parsed.currentUpdateId !== parsed.embeddedUpdateId ? parsed.currentUpdateId : null;

          const db = await admin();
          await rateLimit(db, `ota-ip:${ip}`, 3000, 60);
          await rateLimit(db, `ota:${params.appId}:${installationId}`, 60, 60);

          const device = {
            platform: parsed.platform,
            installationId,
            runtimeVersion: parsed.runtimeVersion,
          };
          const result = await updateCheck(db, {
            appKey: params.appId,
            channelName: parsed.channel,
            ...device,
            currentReleaseId: runningRelease,
          });

          // A device that asks again while running a release has launched it successfully.
          if (runningRelease) {
            const app = await resolveApp(db, params.appId);
            await recordEvent(db, {
              organizationId: app.organization_id as string,
              appId: app.id as string,
              channelId: null,
              releaseId: runningRelease,
              eventType: "install_succeeded",
              input: device,
              eventId: `expo-installed:${runningRelease}:${installationId}`.slice(0, 120),
            });
          }

          const template = (result.release?.manifest as { expo?: ExpoManifestTemplate } | null)?.expo;
          if (result.updateAvailable && result.release && template) {
            const manifest = expoManifest({
              releaseId: result.release.id,
              createdAt: result.release.createdAt,
              runtimeVersion: result.release.runtimeVersion,
              template,
            });
            if (parsed.protocol === "0") {
              return Response.json(manifest, {
                headers: { ...EXPO_RESPONSE_HEADERS, "expo-protocol-version": "0", "x-request-id": requestId },
              });
            }
            return multipart({ name: "manifest", json: manifest }, requestId);
          }

          // Rolled back with nothing to roll back to: send devices back to the store bundle.
          const directive =
            result.reason === "no_release" && runningRelease
              ? { type: "rollBackToEmbedded", parameters: { commitTime: new Date().toISOString() } }
              : { type: "noUpdateAvailable" };
          if (parsed.protocol === "0") {
            return new Response(null, { status: 204, headers: { ...EXPO_RESPONSE_HEADERS, "expo-protocol-version": "0" } });
          }
          return multipart({ name: "directive", json: directive }, requestId);
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});

function multipart(part: Parameters<typeof expoMultipart>[0], requestId: string) {
  const { body, contentType } = expoMultipart(part);
  return new Response(body, {
    headers: { ...EXPO_RESPONSE_HEADERS, "content-type": contentType, "x-request-id": requestId },
  });
}
