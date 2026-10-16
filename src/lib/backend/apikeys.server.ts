/**
 * API key authentication for the public /api/v1 surface, plus a simple
 * database-backed sliding window rate limiter.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { clientIp } from "./client-ip";
import { admin, newRequestId, type OrgContext } from "./context.server";
import { hashApiKey } from "./crypto.server";
import { fail } from "./errors";
import type { OrgRole } from "./rbac";
import { recordSecurityEvent } from "./security.server";

/** Maps API key scopes onto an effective role so one permission model governs everything. */
function roleForScopes(scopes: string[]): OrgRole {
  if (scopes.includes("admin") || scopes.includes("*")) return "admin";
  if (scopes.some((s) => s.startsWith("release.publish") || s.startsWith("rollout"))) return "release_manager";
  if (scopes.some((s) => s.startsWith("release.") || s.startsWith("app."))) return "developer";
  return "viewer";
}

export function bearerFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return request.headers.get("x-api-key");
}

export async function contextFromApiKey(request: Request, requiredScope?: string): Promise<OrgContext> {
  const token = bearerFromRequest(request);
  if (!token) fail("AUTHENTICATION_ERROR", "An API key is required.");

  const db = await admin();
  const { data: key } = await db
    .from("api_keys")
    .select("id, organization_id, name, scopes, status, expires_at, last_used_ip, organizations(name, slug)")
    .eq("token_hash", hashApiKey(token as string))
    .maybeSingle();

  if (!key) fail("API_KEY_INVALID", "The API key is not valid.");
  const rawIp = clientIp(request);
  const ip = rawIp === "unknown" ? null : rawIp;
  const keyLabel = `api key: ${key.name as string}`;
  // A revoked or expired key still in use usually means it leaked or a pipeline was forgotten.
  if (key.status === "revoked") {
    await recordSecurityEvent(db, key.organization_id as string, { kind: "revoked_key_used", severity: "high", title: `Revoked API key "${key.name as string}" was used` }, { label: keyLabel, ip });
    fail("API_KEY_REVOKED", "This API key has been revoked.");
  }
  if (key.expires_at && new Date(key.expires_at as string) < new Date()) {
    await recordSecurityEvent(db, key.organization_id as string, { kind: "expired_key_used", severity: "medium", title: `Expired API key "${key.name as string}" was used` }, { label: keyLabel, ip });
    fail("API_KEY_EXPIRED", "This API key has expired.");
  }
  if (ip && key.last_used_ip && key.last_used_ip !== ip) {
    await recordSecurityEvent(
      db,
      key.organization_id as string,
      { kind: "api_key_new_ip", severity: "low", title: `API key "${key.name as string}" used from a new IP address`, details: { previousIp: key.last_used_ip } },
      { label: keyLabel, ip },
    );
  }

  const scopes = (key.scopes as string[]) ?? [];
  if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes("*")) {
    fail("AUTHORIZATION_ERROR", `This API key lacks the ${requiredScope} scope.`);
  }

  await db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString(), ...(ip ? { last_used_ip: ip } : {}) })
    .eq("id", key.id);

  return {
    db,
    organizationId: key.organization_id as string,
    organizationName: ((Array.isArray(key.organizations) ? key.organizations[0] : key.organizations) as { name?: string } | null)?.name ?? "",
    organizationSlug: ((Array.isArray(key.organizations) ? key.organizations[0] : key.organizations) as { slug?: string } | null)?.slug ?? "",
    userId: null,
    actorLabel: keyLabel,
    ip,
    role: roleForScopes(scopes),
    requestId: request.headers.get("x-request-id") ?? newRequestId(),
    source: "api_key",
  };
}

export const API_SCOPES = [
  "release.read",
  "release.write",
  "release.publish",
  "rollout.write",
  "app.read",
  "app.write",
  "analytics.read",
  "audit.read",
];

/**
 * Sliding window counter kept in Postgres so limits hold across stateless workers.
 * Returns remaining quota; throws RATE_LIMITED when exhausted.
 */
export async function rateLimit(
  db: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<number> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { data, error } = await db.rpc("rate_limit_hit", {
    _bucket: bucket,
    _since: since,
    _limit: limit,
  });
  if (error) {
    // Never fail the request because the limiter itself is unavailable.
    console.error(JSON.stringify({ level: "warn", rateLimit: error.message }));
    return limit;
  }
  const remaining = Number(data ?? limit);
  if (remaining < 0) fail("RATE_LIMITED", "Too many requests. Please retry shortly.");
  return remaining;
}

/**
 * Accepts either a FireOTA API key (CI pipelines) or a Supabase session bearer
 * (the dashboard's own upload path). Used by endpoints both must reach.
 */
export async function contextFromRequest(request: Request, requiredScope?: string): Promise<OrgContext> {
  const token = bearerFromRequest(request);
  if (!token) fail("AUTHENTICATION_ERROR", "Authentication is required.");
  if (token.startsWith("fota_")) return contextFromApiKey(request, requiredScope);

  const db = await admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) fail("AUTHENTICATION_ERROR", "Your session has expired. Sign in again.");
  const { orgContextForUser } = await import("./context.server");
  return orgContextForUser(data.user.id);
}
