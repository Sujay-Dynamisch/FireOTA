/**
 * Malicious / risky activity detection. Rules run inline after each audited action and
 * on API key use; a match is stored in security_events, notified to the workspace and
 * sent to webhooks subscribed to `security.alert`. Detection never fails the request.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { dispatchWebhooks } from "./webhooks.server";

export type Severity = "low" | "medium" | "high";

export interface SecuritySignal {
  kind: string;
  severity: Severity;
  title: string;
  details?: Record<string, unknown>;
}

/** Actions that remove access, data or a live release. */
export const DESTRUCTIVE_ACTIONS = new Set([
  "release.deleted",
  "release.rolled_back",
  "release.archived",
  "app.deleted",
  "channel.deleted",
  "api_key.revoked",
  "api_key.deleted",
  "team.removed",
  "team.suspended",
  "webhook.deleted",
  "firebase.disconnected",
  "firebase.removed",
  "role.deleted",
]);

export const BURST_WINDOW_MINUTES = 10;
export const BURST_THRESHOLD = 5;

/** Phrases typical of prompt-injection attempts against the agent. */
const INJECTION = [
  /ignore (all |any )?(previous|prior|above) (instructions|rules)/i,
  /disregard (your|the) (instructions|system prompt)/i,
  /reveal (your|the) (system prompt|api key|secret)/i,
  /(print|show|output|send) (the )?(api[_ ]?key|secret|token|password)/i,
  /you are now (in )?(developer|dan|jailbreak)/i,
  /delete (all|every) (releases?|apps?|channels?|members?)/i,
];

export function looksLikePromptInjection(text: string) {
  return INJECTION.some((re) => re.test(text));
}

/**
 * Pure rules over one audited action. `recentDestructive` is the actor's destructive
 * action count in the burst window, including this one.
 */
export function signalsForAction(entry: {
  action: string;
  result?: "success" | "failure";
  after?: unknown;
  environment?: string | null;
  recentDestructive?: number;
}): SecuritySignal[] {
  const after = (entry.after && typeof entry.after === "object" ? entry.after : {}) as Record<
    string,
    unknown
  >;
  const out: SecuritySignal[] = [];

  if (DESTRUCTIVE_ACTIONS.has(entry.action) && entry.recentDestructive === BURST_THRESHOLD) {
    out.push({
      kind: "destructive_burst",
      severity: "high",
      title: `${BURST_THRESHOLD} destructive actions in ${BURST_WINDOW_MINUTES} minutes`,
      details: { lastAction: entry.action },
    });
  }
  if (entry.action === "team.role_changed" && ["owner", "admin"].includes(String(after["role"]))) {
    out.push({
      kind: "privilege_escalation",
      severity: "medium",
      title: `A member was given the ${String(after["role"])} role`,
    });
  }
  if (entry.action === "team.invited" && ["owner", "admin"].includes(String(after["role"]))) {
    out.push({
      kind: "privileged_invite",
      severity: "low",
      title: `Invitation with ${String(after["role"])} rights sent`,
    });
  }
  if (
    entry.action === "release.published" &&
    entry.environment === "production" &&
    Number(after["rollout"]) >= 100
  ) {
    out.push({
      kind: "unstaged_production_publish",
      severity: "low",
      title: "Production update published straight to 100%",
    });
  }
  if (
    entry.action === "api_key.created" &&
    Array.isArray(after["scopes"]) &&
    (after["scopes"] as string[]).includes("*")
  ) {
    out.push({
      kind: "wildcard_api_key",
      severity: "medium",
      title: "API key created with full (*) access",
    });
  }
  if (entry.action === "app.signing_updated" && after["required"] === false) {
    out.push({
      kind: "code_signing_disabled",
      severity: "high",
      title: "Code signing requirement was turned off",
    });
  }
  if (entry.action === "release.upload_failed" && after["reason"] === "signature") {
    out.push({
      kind: "invalid_signature",
      severity: "high",
      title: "Upload rejected: invalid code signature",
    });
  }
  if (entry.action === "release.upload_failed" && after["reason"] === "checksum") {
    out.push({
      kind: "checksum_mismatch",
      severity: "medium",
      title: "Upload rejected: checksum mismatch",
    });
  }
  if (entry.action === "agent.blocked") {
    out.push({
      kind: String(after["kind"] ?? "agent_blocked"),
      severity: "medium",
      title: String(after["title"] ?? "Agent action blocked"),
    });
  }
  return out;
}

export async function recordSecurityEvent(
  db: SupabaseClient,
  organizationId: string,
  signal: SecuritySignal,
  actor: { label: string; ip?: string | null },
) {
  try {
    await db.from("security_events").insert({
      organization_id: organizationId,
      kind: signal.kind,
      severity: signal.severity,
      title: signal.title,
      details: signal.details ?? {},
      actor_label: actor.label,
      ip: actor.ip ?? null,
    });
    await db.from("notifications").insert({
      organization_id: organizationId,
      title: `Security: ${signal.title}`,
      body: `${actor.label}${actor.ip ? ` from ${actor.ip}` : ""}`,
      tone: signal.severity === "low" ? "warning" : "danger",
      kind: "security",
      link: "/security",
    });
    if (signal.severity !== "low") {
      await dispatchWebhooks(db, organizationId, "security.alert", {
        kind: signal.kind,
        severity: signal.severity,
        title: signal.title,
        actor: actor.label,
      });
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", securityEvent: String(error) }));
  }
}

/** Runs the action rules for one audit entry. Called by audit(). */
export async function detectAfterAudit(
  db: SupabaseClient,
  organizationId: string,
  entry: {
    action: string;
    actorLabel: string;
    result?: "success" | "failure";
    after?: unknown;
    resourceId?: string | null;
    ip?: string | null;
  },
) {
  try {
    let recentDestructive: number | undefined;
    if (DESTRUCTIVE_ACTIONS.has(entry.action)) {
      const since = new Date(Date.now() - BURST_WINDOW_MINUTES * 60_000).toISOString();
      const { count } = await db
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("actor_label", entry.actorLabel)
        .in("action", [...DESTRUCTIVE_ACTIONS])
        .gte("created_at", since);
      recentDestructive = count ?? 0;
    }
    let environment: string | null = null;
    if (entry.action === "release.published" && entry.resourceId) {
      const { data } = await db
        .from("releases")
        .select("environment")
        .eq("id", entry.resourceId)
        .maybeSingle();
      environment = (data?.environment as string | undefined) ?? null;
    }
    const signals = signalsForAction({
      action: entry.action,
      ...(entry.result ? { result: entry.result } : {}),
      after: entry.after,
      environment,
      ...(recentDestructive !== undefined ? { recentDestructive } : {}),
    });
    for (const signal of signals) {
      await recordSecurityEvent(db, organizationId, signal, {
        label: entry.actorLabel,
        ip: entry.ip ?? null,
      });
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", securityDetect: String(error) }));
  }
}
