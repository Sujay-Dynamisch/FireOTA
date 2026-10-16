/**
 * Request context, tenancy resolution, permission enforcement and auditing.
 * Every mutating operation in FireOTA passes through here:
 *   authenticate -> resolve organization -> verify membership -> verify permission -> execute -> audit
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError, fail } from "./errors";
import { notificationFor } from "./notifications";
import type { OrgRole, Permission } from "./rbac";
import { ROLE_PERMISSIONS, effectivePermissions } from "./rbac";
import { detectAfterAudit } from "./security.server";

export interface OrgContext {
  db: SupabaseClient;
  organizationId: string;
  organizationName: string;
  organizationSlug?: string;
  userId: string | null;
  actorLabel: string;
  role: OrgRole;
  /** Effective permissions (custom role aware). Falls back to the built-in role's list. */
  permissions?: Permission[];
  requestId: string;
  ip?: string | null;
  source: "dashboard" | "api_key" | "agent";
}

export async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

/** Resolves the caller's organization membership. Never trusts a client supplied organizationId. */
export async function orgContextForUser(userId: string, organizationId?: string): Promise<OrgContext> {
  const db = await admin();
  let query = db
    .from("organization_members")
    .select("organization_id, role, name, email, organizations(name, slug), custom_roles(permissions)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data, error } = await query.order("created_at", { ascending: true }).limit(1);
  if (error) throw new ApiError("INTERNAL_ERROR", "Could not resolve organization membership.");
  const member = data?.[0] as
    | {
        organization_id: string;
        role: OrgRole;
        name: string;
        email: string;
        organizations: { name: string; slug: string } | null;
        custom_roles: { permissions: string[] } | null;
      }
    | undefined;
  if (!member) fail("AUTHORIZATION_ERROR", "You are not a member of an organization yet.");

  await db
    .from("organization_members")
    .update({ last_active_at: new Date().toISOString() })
    .eq("organization_id", member.organization_id)
    .eq("user_id", userId);

  return {
    db,
    organizationId: member.organization_id,
    organizationName: member.organizations?.name ?? "",
    organizationSlug: member.organizations?.slug ?? "",
    userId,
    actorLabel: member.name || member.email,
    role: member.role,
    permissions: effectivePermissions(member.role, member.custom_roles?.permissions ?? null),
    requestId: newRequestId(),
    source: "dashboard",
  };
}

export function hasPermission(ctx: OrgContext, permission: Permission) {
  return (ctx.permissions ?? ROLE_PERMISSIONS[ctx.role]).includes(permission);
}

export function requirePermission(ctx: OrgContext, permission: Permission) {
  if (!hasPermission(ctx, permission)) {
    fail("AUTHORIZATION_ERROR", `Your role (${ctx.role}) cannot perform ${permission}.`);
  }
}

/** Loads a row and proves it belongs to the caller's organization (IDOR protection). */
export async function ownedRow<T extends Record<string, unknown>>(
  ctx: OrgContext,
  table: string,
  id: string,
  columns = "*",
): Promise<T> {
  const { data, error } = await ctx.db
    .from(table)
    .select(columns)
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL_ERROR", "Could not load the requested resource.");
  if (!data) fail("RESOURCE_NOT_FOUND", "The requested resource was not found.");
  return data as unknown as T;
}

export async function audit(
  ctx: OrgContext,
  entry: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    appId?: string | null;
    appName?: string;
    result?: "success" | "failure";
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  },
) {
  const { error } = await ctx.db.from("audit_logs").insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.userId,
    actor_label: ctx.actorLabel || ctx.source,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    app_id: entry.appId ?? null,
    app_name: entry.appName ?? "",
    result: entry.result ?? "success",
    ip: entry.ip ?? ctx.ip ?? null,
    request_id: ctx.requestId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  if (error) console.error(JSON.stringify({ level: "error", requestId: ctx.requestId, audit: error.message }));

  // Every audited action becomes a workspace notification and is screened for risky patterns.
  const actorLabel = ctx.actorLabel || ctx.source;
  const draft = notificationFor({ ...entry, actorLabel });
  await notify(ctx, { title: draft.title, body: draft.body, tone: draft.tone, kind: draft.kind, link: draft.link });
  await detectAfterAudit(ctx.db, ctx.organizationId, {
    action: entry.action,
    actorLabel,
    ...(entry.result ? { result: entry.result } : {}),
    after: entry.after,
    resourceId: entry.resourceId ?? null,
    ip: entry.ip ?? ctx.ip ?? null,
  });
}

export async function notify(
  ctx: OrgContext,
  entry: {
    title: string;
    body?: string;
    tone?: "success" | "warning" | "danger" | "info";
    userId?: string | null;
    kind?: string;
    link?: string | null;
  },
) {
  const { error } = await ctx.db.from("notifications").insert({
    organization_id: ctx.organizationId,
    user_id: entry.userId ?? null,
    title: entry.title,
    body: entry.body ?? "",
    tone: entry.tone ?? "info",
    kind: entry.kind ?? "activity",
    link: entry.link ?? null,
  });
  if (error) console.error(JSON.stringify({ level: "error", requestId: ctx.requestId, notify: error.message }));
}

export function log(ctx: Pick<OrgContext, "requestId" | "organizationId" | "userId">, fields: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      level: "info",
      requestId: ctx.requestId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      at: new Date().toISOString(),
      ...fields,
    }),
  );
}
