/**
 * Organization, team, audit, notification and dashboard server functions.
 * These are the real backend for the existing FireOTA screens.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { admin, audit, log, newRequestId, orgContextForUser, requirePermission } from "@/lib/backend/context.server";
import { ApiError, fail } from "@/lib/backend/errors";
import type { OrgRole } from "@/lib/backend/rbac";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function ago(value: string | null) {
  if (!value) return "never";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The signed-in user's profile plus the organization they belong to (if any). */
export const getSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("id, name, email, avatar_url")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: membership } = await db
      .from("organization_members")
      .select("role, organization_id, organizations(id, name, slug, timezone, default_channel)")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const org = membership?.organizations as
      | { id: string; name: string; slug: string; timezone: string; default_channel: string }
      | null
      | undefined;

    return {
      user: {
        id: context.userId,
        name: profile?.name || profile?.email?.split("@")[0] || "",
        email: profile?.email ?? "",
        avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
        role: (membership?.role as OrgRole | undefined) ?? null,
      },
      organization: org
        ? {
            id: org.id,
            name: org.name,
            slug: org.slug,
            timezone: org.timezone,
            defaultChannel: org.default_channel,
          }
        : null,
    };
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; slug?: string; timezone?: string }) =>
    z.object({ name: z.string().min(2).max(80), slug: z.string().max(48).optional(), timezone: z.string().max(64).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: existing } = await db
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (existing) fail("CONFLICT", "You already belong to an organization.");

    const slug = slugify(data.slug ?? data.name);
    const { data: org, error } = await db
      .from("organizations")
      .insert({
        name: data.name,
        slug,
        timezone: data.timezone ?? "UTC",
        created_by: context.userId,
      })
      .select("id, name, slug, timezone, default_channel")
      .single();
    if (error) {
      if (error.code === "23505" || error.code === "23514" || error.message.includes("duplicate")) {
        fail("CONFLICT", "That workspace URL is already taken.");
      }
      throw new ApiError("INTERNAL_ERROR", "Could not create the organization.");
    }

    const { data: profile } = await db.from("profiles").select("name, email").eq("id", context.userId).maybeSingle();
    await db.from("organization_members").insert({
      organization_id: org.id,
      user_id: context.userId,
      email: profile?.email ?? "",
      name: profile?.name ?? "",
      role: "owner",
      status: "active",
    });

    const ctx = await orgContextForUser(context.userId, org.id);
    await audit(ctx, { action: "organization.created", resourceType: "organization", resourceId: org.id, after: { name: org.name, slug } });
    log(ctx, { event: "organization.created" });

    return { id: org.id, name: org.name, slug: org.slug, timezone: org.timezone, defaultChannel: org.default_channel };
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name?: string; timezone?: string; defaultChannel?: string; requirePublishConfirmation?: boolean }) =>
    z
      .object({
        name: z.string().min(2).max(80).optional(),
        timezone: z.string().max(64).optional(),
        defaultChannel: z.string().max(40).optional(),
        requirePublishConfirmation: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "org.update");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.timezone !== undefined) patch["timezone"] = data.timezone;
    if (data.defaultChannel !== undefined) patch["default_channel"] = data.defaultChannel;
    if (data.requirePublishConfirmation !== undefined) patch["require_publish_confirmation"] = data.requirePublishConfirmation;

    const { data: row, error } = await ctx.db
      .from("organizations")
      .update(patch)
      .eq("id", ctx.organizationId)
      .select("id, name, slug, timezone, default_channel, require_publish_confirmation")
      .single();
    if (error) throw new ApiError("INTERNAL_ERROR", "Could not update the organization.");
    await audit(ctx, { action: "organization.updated", resourceType: "organization", resourceId: ctx.organizationId, after: patch });
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      timezone: row.timezone,
      defaultChannel: row.default_channel,
      requirePublishConfirmation: row.require_publish_confirmation,
    };
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.read");
    const { data } = await ctx.db
      .from("organization_members")
      .select("id, name, email, role, status, last_active_at, created_at")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: true });

    return (data ?? []).map((m) => ({
      id: m.id as string,
      name: (m.name as string) || (m.email as string),
      email: m.email as string,
      role: m.role as OrgRole,
      status: m.status as "active" | "invited" | "suspended",
      lastActive: ago(m.last_active_at as string | null),
      joined: new Date(m.created_at as string).toISOString().slice(0, 10),
      initials: initials((m.name as string) || (m.email as string)),
    }));
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; role: string }) =>
    z
      .object({
        email: z.string().email(),
        role: z.enum(["owner", "admin", "release_manager", "developer", "viewer"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    if (data.role === "owner" && ctx.role !== "owner") fail("AUTHORIZATION_ERROR", "Only an owner can invite another owner.");

    const { error } = await ctx.db.from("organization_members").insert({
      organization_id: ctx.organizationId,
      email: data.email.toLowerCase(),
      name: data.email.split("@")[0] ?? data.email,
      role: data.role,
      status: "invited",
      invited_by: context.userId,
    });
    if (error) fail("CONFLICT", "That person is already a member or invited.");

    await audit(ctx, { action: "team.invited", resourceType: "member", after: { email: data.email, role: data.role } });
    return { email: data.email, role: data.role, status: "invited" as const };
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; role: string }) =>
    z.object({ id: z.string().uuid(), role: z.enum(["owner", "admin", "release_manager", "developer", "viewer"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    const { data: member } = await ctx.db
      .from("organization_members")
      .select("id, role, user_id, email")
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!member) fail("RESOURCE_NOT_FOUND", "That member is not part of this organization.");
    if (member.role === "owner" && ctx.role !== "owner") fail("AUTHORIZATION_ERROR", "Only an owner can change an owner.");
    if (member.role === "owner" && data.role !== "owner") {
      const { count } = await ctx.db
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .eq("role", "owner");
      if ((count ?? 0) <= 1) fail("CONFLICT", "An organization must keep at least one owner.");
    }

    await ctx.db.from("organization_members").update({ role: data.role }).eq("id", data.id);
    await audit(ctx, {
      action: "team.role_changed",
      resourceType: "member",
      resourceId: data.id,
      before: { role: member.role },
      after: { role: data.role },
    });
    return { id: data.id, role: data.role };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    const { data: member } = await ctx.db
      .from("organization_members")
      .select("id, role, email, user_id")
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!member) fail("RESOURCE_NOT_FOUND", "That member is not part of this organization.");
    if (member.role === "owner") fail("CONFLICT", "Transfer ownership before removing an owner.");

    await ctx.db.from("organization_members").delete().eq("id", data.id);
    await audit(ctx, { action: "team.removed", resourceType: "member", resourceId: data.id, before: { email: member.email } });
    return { id: data.id, removed: true };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { actor?: string; action?: string; result?: string } | undefined) =>
    z
      .object({ actor: z.string().max(120).optional(), action: z.string().max(80).optional(), result: z.string().max(20).optional() })
      .optional()
      .parse(input ?? undefined),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "audit.read");
    let query = ctx.db
      .from("audit_logs")
      .select("id, created_at, actor_label, action, resource_type, resource_id, app_name, result, ip, request_id, before, after")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data?.actor) query = query.ilike("actor_label", `%${data.actor}%`);
    if (data?.action) query = query.eq("action", data.action);
    if (data?.result) query = query.eq("result", data.result);

    const { data: rows } = await query;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      at: new Date(r.created_at as string).toISOString().replace("T", " ").slice(0, 19) + " UTC",
      actor: r.actor_label as string,
      action: r.action as string,
      resource: r.resource_type as string,
      resourceId: (r.resource_id as string) ?? "",
      appName: (r.app_name as string) ?? "",
      result: r.result as "success" | "failure",
      ip: (r.ip as string) ?? "",
      requestId: (r.request_id as string) ?? "",
      before: r.before ? JSON.stringify(r.before, null, 2) : "",
      after: r.after ? JSON.stringify(r.after, null, 2) : "",
    }));
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    const { data } = await ctx.db
      .from("notifications")
      .select("id, title, body, tone, read_at, created_at")
      .eq("organization_id", ctx.organizationId)
      .or(`user_id.is.null,user_id.eq.${context.userId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((n) => ({
      id: n.id as string,
      title: n.title as string,
      body: (n.body as string) ?? "",
      tone: n.tone as "success" | "warning" | "danger" | "info",
      at: ago(n.created_at as string),
      read: Boolean(n.read_at),
    }));
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    await ctx.db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("organization_id", ctx.organizationId)
      .is("read_at", null);
    return { ok: true };
  });

export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    const { data } = await ctx.db
      .from("audit_logs")
      .select("id, action, actor_label, app_name, resource_id, created_at")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(12);

    const kindFor = (action: string) => {
      if (action.includes("published")) return "published" as const;
      if (action.includes("rolled_back")) return "rolled_back" as const;
      if (action.includes("paused")) return "paused" as const;
      if (action.startsWith("firebase")) return "firebase" as const;
      if (action.startsWith("team")) return "member" as const;
      if (action.startsWith("api_key")) return "api_key" as const;
      return "published" as const;
    };

    return (data ?? []).map((row) => ({
      id: row.id as string,
      kind: kindFor(row.action as string),
      message: `${row.actor_label as string} ${(row.action as string).replace(/[._]/g, " ")}`,
      meta: [(row.app_name as string) || null, (row.resource_id as string) || null].filter(Boolean).join(" · "),
      at: ago(row.created_at as string),
    }));
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    const requestId = newRequestId();
    void requestId;

    const [{ data: profile }, apps, published, rollouts, project, events] = await Promise.all([
      ctx.db.from("profiles").select("name").eq("id", context.userId).maybeSingle(),
      ctx.db.from("apps").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organizationId),
      ctx.db
        .from("releases")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .eq("status", "published"),
      ctx.db
        .from("rollouts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .eq("status", "active"),
      ctx.db
        .from("firebase_projects")
        .select("display_name, status, storage_enabled, firestore_enabled, permissions")
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      ctx.db
        .from("analytics_events")
        .select("event_type")
        .eq("organization_id", ctx.organizationId)
        .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
        .limit(20000),
    ]);

    const rows = events.data ?? [];
    const successful = rows.filter((r) => r.event_type === "install_succeeded").length;
    const failed = rows.filter((r) => r.event_type === "install_failed").length;
    const rollbacks = rows.filter((r) => r.event_type === "rollback").length;
    const checks = rows.filter((r) => r.event_type === "update_check").length;
    const successRate = successful + failed > 0 ? Number(((successful / (successful + failed)) * 100).toFixed(1)) : 0;
    const adoption = checks > 0 ? Number(((successful / checks) * 100).toFixed(0)) : 0;

    const permissions = Array.isArray(project.data?.permissions)
      ? (project.data?.permissions as { granted: boolean; optional?: boolean }[]).every((p) => p.granted || p.optional)
      : false;

    return {
      greetingName: (profile?.name ?? "").split(" ")[0] ?? "",
      stats: {
        apps: apps.count ?? 0,
        productionReleases: published.count ?? 0,
        activeRollouts: rollouts.count ?? 0,
        successRate,
      },
      health: { adoption, successful, failed, rollbacks, rollbackRefs: "" },
      firebase: {
        name: project.data?.display_name ?? "",
        status: (project.data?.status as "connected" | "degraded" | "expired" | "disconnected") ?? "disconnected",
        storage: Boolean(project.data?.storage_enabled),
        firestore: Boolean(project.data?.firestore_enabled),
        permissions,
      },
    };
  });
