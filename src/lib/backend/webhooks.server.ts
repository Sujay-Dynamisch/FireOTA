/**
 * Outbound webhooks: HMAC-SHA256 signed and timestamped. Each delivery gets one
 * bounded inline attempt so a slow receiver can never stall a release operation;
 * failures are queued (next_attempt_at) and retried with exponential backoff by
 * retryDueWebhooks(), which a scheduler calls. Exhausted deliveries become dead letters.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptSecret, encryptSecret, signPayload } from "./crypto.server";

export type WebhookEvent =
  | "release.created"
  | "release.ready"
  | "release.published"
  | "release.paused"
  | "release.rolled_back"
  | "release.failed"
  | "release.archived"
  | "rollout.updated"
  | "rollout.completed"
  | "firebase.disconnected"
  | "firebase.expired"
  | "app.created"
  | "channel.created"
  | "channel.updated"
  | "channel.deleted"
  | "release.deleted"
  | "app.deleted"
  | "agent.approval_requested"
  | "security.alert"
  | "webhook.test";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "release.created",
  "release.ready",
  "release.published",
  "release.paused",
  "release.rolled_back",
  "release.failed",
  "release.archived",
  "rollout.updated",
  "rollout.completed",
  "firebase.disconnected",
  "firebase.expired",
  "app.created",
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "release.deleted",
  "app.deleted",
  "agent.approval_requested",
  "security.alert",
];

export const MAX_ATTEMPTS = 6;
const TIMEOUT_MS = 4000;
const ENCRYPTED_PREFIX = "enc:v1:";

/** 1m, 2m, 4m, 8m, 16m between attempts. */
export function backoffMs(attempt: number) {
  return Math.min(60_000 * 2 ** (attempt - 1), 60 * 60_000);
}

/** Secrets are stored encrypted; legacy plaintext rows are still readable. */
export function sealWebhookSecret(secret: string) {
  return `${ENCRYPTED_PREFIX}${encryptSecret(secret)}`;
}
function openWebhookSecret(stored: string) {
  return stored.startsWith(ENCRYPTED_PREFIX) ? decryptSecret(stored.slice(ENCRYPTED_PREFIX.length)) : stored;
}

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|\[?(::1?|f[cd][0-9a-f]{2}:.*|fe80:.*|::ffff:.*)\]?)$/i;

/**
 * Rejects endpoints that are not public HTTPS hosts. Hostnames that are bare
 * integers or hex (e.g. http://2130706433) are rejected too. Edge runtimes cannot
 * reach private networks, which also covers DNS names resolving to private IPs.
 */
export function webhookEndpointProblem(endpoint: string): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "The webhook endpoint is not a valid URL.";
  }
  if (url.protocol !== "https:") return "Webhook endpoints must use HTTPS.";
  if (url.username || url.password) return "Webhook endpoints must not contain credentials.";
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || !host.includes(".")) {
    return "Private network endpoints are not allowed.";
  }
  return null;
}

interface HookRow {
  id: string;
  endpoint: string;
  secret: string;
}

async function attempt(
  db: SupabaseClient,
  organizationId: string,
  hook: HookRow,
  event: string,
  body: string,
  deliveryId: string,
  attemptNumber: number,
) {
  const startedAt = Date.now();
  let status = 0;
  let error: string | null = null;
  let succeeded = false;

  const problem = webhookEndpointProblem(hook.endpoint);
  if (problem) {
    error = problem;
  } else {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(hook.endpoint, {
          method: "POST",
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "content-type": "application/json",
            "user-agent": "FireOTA-Webhooks/1",
            "x-fireota-event": event,
            "x-fireota-delivery": deliveryId,
            "x-fireota-timestamp": timestamp,
            "x-fireota-signature": `sha256=${signPayload(openWebhookSecret(hook.secret), `${timestamp}.${body}`)}`,
          },
          body,
        });
        status = response.status;
        succeeded = response.ok;
        if (!succeeded) error = `HTTP ${response.status}`;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      error = err instanceof Error && err.name === "AbortError" ? "timeout" : "delivery failed";
    }
  }

  const exhausted = !succeeded && (attemptNumber >= MAX_ATTEMPTS || problem !== null);
  await db.from("webhook_deliveries").insert({
    organization_id: organizationId,
    webhook_id: hook.id,
    delivery_id: deliveryId,
    event,
    payload: succeeded ? null : body,
    status_code: status,
    latency_ms: Date.now() - startedAt,
    attempt: attemptNumber,
    succeeded,
    error,
    dead: exhausted,
    next_attempt_at: succeeded || exhausted ? null : new Date(Date.now() + backoffMs(attemptNumber)).toISOString(),
  });
  await db
    .from("webhooks")
    .update({ last_delivery_at: new Date().toISOString(), status: succeeded ? "active" : "failing" })
    .eq("id", hook.id)
    .neq("status", "paused");
  return succeeded;
}

/** Never throws into the business operation that triggered it. */
export async function dispatchWebhooks(
  db: SupabaseClient,
  organizationId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  onlyWebhookId?: string,
) {
  try {
    let query = db
      .from("webhooks")
      .select("id, endpoint, events, secret, status")
      .eq("organization_id", organizationId)
      .neq("status", "paused");
    if (onlyWebhookId) query = query.eq("id", onlyWebhookId);
    const { data: hooks } = await query;

    const targets = (hooks ?? []).filter((h) => onlyWebhookId || (h.events as string[]).includes(event));
    if (targets.length === 0) return;

    await Promise.all(
      targets.map((hook) => {
        const deliveryId = crypto.randomUUID();
        const body = JSON.stringify({ event, id: deliveryId, createdAt: new Date().toISOString(), data: payload });
        return attempt(db, organizationId, hook as HookRow, event, body, deliveryId, 1);
      }),
    );
    // The scheduled sweep may run only daily (Vercel Hobby cron), so piggy-back a couple of
    // due retries for this organization on live traffic. Bounded to keep requests fast.
    if (!onlyWebhookId) await retryDueWebhooks(db, 2, organizationId);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", webhookDispatch: String(error) }));
  }
}

/** Retries queued deliveries whose backoff has elapsed. Each row is claimed atomically. */
export async function retryDueWebhooks(db: SupabaseClient, limit = 50, organizationId?: string) {
  let dueQuery = db
    .from("webhook_deliveries")
    .select("id")
    .lte("next_attempt_at", new Date().toISOString())
    .eq("dead", false);
  if (organizationId) dueQuery = dueQuery.eq("organization_id", organizationId);
  const { data: due } = await dueQuery.order("next_attempt_at", { ascending: true }).limit(limit);

  let delivered = 0;
  let failed = 0;
  for (const row of due ?? []) {
    const { data: claimed } = await db
      .from("webhook_deliveries")
      .update({ next_attempt_at: null })
      .eq("id", row.id)
      .not("next_attempt_at", "is", null)
      .select("organization_id, webhook_id, delivery_id, event, payload, attempt");
    const job = claimed?.[0];
    if (!job?.payload) continue;

    const { data: hook } = await db
      .from("webhooks")
      .select("id, endpoint, secret, status")
      .eq("id", job.webhook_id)
      .maybeSingle();
    if (!hook || hook.status === "paused") continue;

    const ok = await attempt(
      db,
      job.organization_id as string,
      hook as HookRow,
      job.event as string,
      job.payload as string,
      (job.delivery_id as string) ?? crypto.randomUUID(),
      Number(job.attempt ?? 1) + 1,
    );
    if (ok) delivered += 1;
    else failed += 1;
  }
  return { processed: (due ?? []).length, delivered, failed };
}
