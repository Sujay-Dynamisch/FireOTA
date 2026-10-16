/**
 * Device telemetry ingestion: download and install outcomes, plus rollbacks.
 * Crossing a release's failure threshold pauses it automatically.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { rateLimit } from "@/lib/backend/apikeys.server";
import { clientIp } from "@/lib/backend/client-ip";
import { admin } from "@/lib/backend/context.server";
import { jsonError, jsonOk } from "@/lib/backend/errors";
import { evaluateRollbackThreshold, recordEvent, resolveApp } from "@/lib/backend/ota.server";

const schema = z.object({
  app: z.string().min(1).max(80),
  releaseId: z.string().uuid(),
  platform: z.enum(["android", "ios"]),
  installationId: z.string().min(8).max(120),
  runtimeVersion: z.string().min(1).max(40),
  nativeVersion: z.string().max(40).optional(),
  appVersion: z.string().max(40).optional(),
  event: z.enum(["download_started", "download_completed", "install_succeeded", "install_failed", "rollback"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Client generated, stable per event: resubmissions are stored once. */
  eventId: z.string().min(8).max(80).optional(),
});

export const Route = createFileRoute("/api/public/v1/updates/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        try {
          const body = schema.parse(await request.json());
          const db = await admin();
          await rateLimit(db, `ota-events-ip:${clientIp(request)}`, 3000, 60);
          await rateLimit(db, `ota-events:${body.installationId}`, 120, 60);

          const app = await resolveApp(db, body.app);
          const { data: release } = await db
            .from("releases")
            .select("id, organization_id, app_id, channel_id")
            .eq("id", body.releaseId)
            .eq("app_id", app.id)
            .maybeSingle();
          // Only devices that registered through an update check may report outcomes.
          const { data: installation } = await db
            .from("device_installations")
            .select("id")
            .eq("app_id", app.id)
            .eq("installation_id", body.installationId)
            .maybeSingle();
          if (!release || !installation) {
            return jsonOk({ recorded: false }, { headers: { "x-request-id": requestId } });
          }

          const recorded = await recordEvent(db, {
            organizationId: release.organization_id as string,
            appId: release.app_id as string,
            channelId: (release.channel_id as string) ?? null,
            releaseId: release.id as string,
            eventType: body.event,
            input: {
              platform: body.platform,
              installationId: body.installationId,
              runtimeVersion: body.runtimeVersion,
              ...(body.nativeVersion ? { nativeVersion: body.nativeVersion } : {}),
              ...(body.appVersion ? { appVersion: body.appVersion } : {}),
            },
            ...(body.metadata ? { metadata: body.metadata } : {}),
            ...(body.eventId ? { eventId: body.eventId } : {}),
          });
          if (!recorded) return jsonOk({ recorded: false, duplicate: true }, { headers: { "x-request-id": requestId } });

          if (body.event === "install_succeeded") {
            await db
              .from("device_installations")
              .update({ current_release_id: body.releaseId, last_seen_at: new Date().toISOString() })
              .eq("app_id", release.app_id)
              .eq("installation_id", body.installationId);
            // Tell the team the moment a new update is live on its first real device.
            const { count } = await db
              .from("analytics_events")
              .select("id", { count: "exact", head: true })
              .eq("release_id", body.releaseId)
              .eq("event_type", "install_succeeded");
            if (count === 1) {
              await db.from("notifications").insert({
                organization_id: release.organization_id,
                title: "Update installed on its first device",
                body: `A ${body.platform} device on runtime ${body.runtimeVersion} is now running the update.`,
                tone: "success",
                kind: "rollout",
                link: `/releases/${body.releaseId}`,
              });
            }
          }

          if (body.event === "install_failed" || body.event === "rollback") {
            await evaluateRollbackThreshold(db, body.releaseId);
          }

          return jsonOk({ recorded: true }, { headers: { "x-request-id": requestId } });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
