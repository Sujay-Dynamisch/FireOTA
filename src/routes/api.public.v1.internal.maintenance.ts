/**
 * POST /api/public/v1/internal/maintenance — run by a scheduler (e.g. a Cloudflare
 * Cron Trigger every minute). Retries due webhook deliveries and prunes expired
 * OAuth states. Authenticated with `Authorization: Bearer $FIREOTA_CRON_SECRET`.
 */
import { createFileRoute } from "@tanstack/react-router";

import { admin } from "@/lib/backend/context.server";
import { safeEqual } from "@/lib/backend/crypto.server";
import { jsonError, jsonOk } from "@/lib/backend/errors";
import { retryDueWebhooks } from "@/lib/backend/webhooks.server";

function authorized(request: Request) {
  const secret = process.env["FIREOTA_CRON_SECRET"];
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  return safeEqual(header.slice(7), secret);
}

export const Route = createFileRoute("/api/public/v1/internal/maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        if (!authorized(request)) {
          return Response.json(
            { success: false, error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized." } },
            { status: 401 },
          );
        }
        try {
          const db = await admin();
          const webhooks = await retryDueWebhooks(db);
          await db
            .from("oauth_states")
            .delete()
            .lt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
          return jsonOk({ webhooks }, { headers: { "x-request-id": requestId } });
        } catch (error) {
          return jsonError(error, requestId);
        }
      },
    },
  },
});
