/**
 * /api/public/v1/internal/maintenance — run by a scheduler. Retries due webhook
 * deliveries and prunes expired OAuth states. Accepts POST (any scheduler) and GET
 * (Vercel Cron). Authenticated with `Authorization: Bearer <secret>`, where the
 * secret is FIREOTA_CRON_SECRET or CRON_SECRET (Vercel sends the latter automatically).
 */
import { createFileRoute } from "@tanstack/react-router";

import { admin } from "@/lib/backend/context.server";
import { safeEqual } from "@/lib/backend/crypto.server";
import { jsonError, jsonOk } from "@/lib/backend/errors";
import { retryDueWebhooks } from "@/lib/backend/webhooks.server";

function authorized(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  return [process.env["FIREOTA_CRON_SECRET"], process.env["CRON_SECRET"]].some(
    (secret) => Boolean(secret) && safeEqual(token, secret as string),
  );
}

async function run(request: Request) {
  const requestId = crypto.randomUUID();
  if (!authorized(request)) {
    return Response.json({ success: false, error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized." } }, { status: 401 });
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
}

export const Route = createFileRoute("/api/public/v1/internal/maintenance")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
