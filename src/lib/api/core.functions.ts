/**
 * Organization, team, audit, notification and dashboard server functions.
 * These are the real backend for the existing FireOTA screens.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { admin, audit, hasPermission, log, newRequestId, orgContextForUser, ownedRow, requirePermission } from "@/lib/backend/context.server";
import { ApiError, fail } from "@/lib/backend/errors";
import { acceptPendingInvites, deliverInvite } from "@/lib/backend/invites.server";
import { NOTIFICATION_PREFS, prefEnabled } from "@/lib/backend/notifications";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, type OrgRole } from "@/lib/backend/rbac";

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
    // An invited person joins their workspace the first time they sign in with that email.
    await acceptPendingInvites(db, context.userId);
    const { data: profile } = await db
      .from("profiles")
      .select("id, name, email, avatar_url")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: membership } = await db
      .from("organization_members")
      .select("role, organization_id, custom_roles(name, permissions), organizations(id, name, slug, timezone, default_channel, require_publish_confirmation)")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const org = membership?.organizations as
      | { id: string; name: string; slug: string; timezone: string; default_channel: string; require_publish_confirmation: boolean }
      | null
      | undefined;
    const customRole = membership?.custom_roles as { name: string; permissions: string[] } | null | undefined;
    const role = (membership?.role as OrgRole | undefined) ?? null;
    const permissions: string[] = role
      ? role === "owner"
        ? [...ROLE_PERMISSIONS.owner]
        : customRole
          ? ALL_PERMISSIONS.filter((p) => customRole.permissions.includes(p))
          : [...ROLE_PERMISSIONS[role]]
      : [];

    return {
      user: {
        id: context.userId,
        name: profile?.name || profile?.email?.split("@")[0] || "",
        email: profile?.email ?? "",
        avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
        role,
        customRole: customRole?.name ?? null,
        permissions,
      },
      organization: org
        ? {
            id: org.id,
            name: org.name,
            slug: org.slug,
            timezone: org.timezone,
            defaultChannel: org.default_channel,
            requirePublishConfirmation: org.require_publish_confirmation,
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
  .inputValidator((input: { name?: string; slug?: string; timezone?: string; defaultChannel?: string; requirePublishConfirmation?: boolean }) =>
    z
      .object({
        name: z.string().min(2).max(80).optional(),
        slug: z.string().min(2).max(48).optional(),
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
    if (data.slug !== undefined) {
      const slug = slugify(data.slug);
      if (slug.length < 2 || slug === "workspace") fail("INVALID_INPUT", "Choose a workspace ID with at least 2 letters or digits.");
      patch["slug"] = slug;
    }
    if (data.timezone !== undefined) patch["timezone"] = data.timezone;
    if (data.defaultChannel !== undefined) patch["default_channel"] = data.defaultChannel;
    if (data.requirePublishConfirmation !== undefined) patch["require_publish_confirmation"] = data.requirePublishConfirmation;

    const { data: row, error } = await ctx.db
      .from("organizations")
      .update(patch)
      .eq("id", ctx.organizationId)
      .select("id, name, slug, timezone, default_channel, require_publish_confirmation")
      .single();
    if (error) {
      if (error.code === "23505") fail("CONFLICT", "That workspace ID is already taken.");
      throw new ApiError("INTERNAL_ERROR", "Could not update the organization.");
    }
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

/**
 * Deletes the workspace and everything in it (apps, releases, keys, webhooks, members).
 * Owner only, confirmed by typing the workspace ID. Bundles already uploaded stay in the
 * customer's own Firebase Storage bucket.
 */
export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirmSlug: string }) => z.object({ confirmSlug: z.string().max(48) }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    if (ctx.role !== "owner") fail("AUTHORIZATION_ERROR", "Only an owner can delete the workspace.");
    if (data.confirmSlug !== ctx.organizationSlug) fail("INVALID_INPUT", "Type the workspace ID exactly to confirm.");
    const { error } = await ctx.db.from("organizations").delete().eq("id", ctx.organizationId);
    if (error) throw new ApiError("INTERNAL_ERROR", "Could not delete the workspace.");
    log(ctx, { event: "organization.deleted", slug: ctx.organizationSlug });
    return { deleted: true };
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.read");
    const { data } = await ctx.db
      .from("organization_members")
      .select("id, name, email, role, status, last_active_at, created_at, user_id, custom_role_id, custom_roles(name)")
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
      customRoleId: (m.custom_role_id as string | null) ?? null,
      customRoleName: (m.custom_roles as { name?: string } | null)?.name ?? null,
      isYou: m.user_id === context.userId,
    }));
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; role: string; customRoleId?: string | null }) =>
    z
      .object({
        email: z.string().email(),
        role: z.enum(["owner", "admin", "release_manager", "developer", "viewer"]),
        customRoleId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    if (data.role === "owner" && ctx.role !== "owner") fail("AUTHORIZATION_ERROR", "Only an owner can invite another owner.");
    if (data.customRoleId) await ownedRow(ctx, "custom_roles", data.customRoleId, "id");

    const { error } = await ctx.db.from("organization_members").insert({
      organization_id: ctx.organizationId,
      email: data.email.toLowerCase(),
      name: data.email.split("@")[0] ?? data.email,
      role: data.customRoleId ? "viewer" : data.role,
      custom_role_id: data.customRoleId ?? null,
      status: "invited",
      invited_by: context.userId,
    });
    if (error) fail("CONFLICT", "That person is already a member or invited.");

    const delivery = await deliverInvite(ctx.db, {
      email: data.email.toLowerCase(),
      redirectTo: inviteRedirect(),
      organizationId: ctx.organizationId,
      organizationName: ctx.organizationName,
      inviterLabel: ctx.actorLabel,
    });
    await audit(ctx, {
      action: "team.invited",
      resourceType: "member",
      after: { email: data.email, role: data.role, emailSent: delivery.emailSent },
    });
    return { email: data.email, role: data.role, status: "invited" as const, ...delivery };
  });

/** Where invite links land: the public site URL when configured, else this request's origin. */
function inviteRedirect() {
  const base = process.env["FIREOTA_PUBLIC_URL"] ?? new URL(getRequest().url).origin;
  return `${base.replace(/\/+$/, "")}/dashboard`;
}

/** Sends the invitation again (or produces a fresh link) for a pending member. */
export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    const member = await ownedRow<{ email: string; status: string }>(ctx, "organization_members", data.id, "email, status");
    if (member.status !== "invited") fail("CONFLICT", "This member has already joined.");
    const delivery = await deliverInvite(ctx.db, {
      email: member.email,
      redirectTo: inviteRedirect(),
      organizationId: ctx.organizationId,
      organizationName: ctx.organizationName,
      inviterLabel: ctx.actorLabel,
    });
    return { email: member.email, ...delivery };
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; role: string; customRoleId?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        role: z.enum(["owner", "admin", "release_manager", "developer", "viewer"]),
        customRoleId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    const { data: member } = await ctx.db
      .from("organization_members")
      .select("id, role, user_id, email, custom_role_id")
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!member) fail("RESOURCE_NOT_FOUND", "That member is not part of this organization.");
    if (member.user_id === context.userId) fail("CONFLICT", "You cannot change your own role.");
    if (member.role === "owner" && ctx.role !== "owner") fail("AUTHORIZATION_ERROR", "Only an owner can change an owner.");
    if (data.role === "owner" && ctx.role !== "owner") fail("AUTHORIZATION_ERROR", "Only an owner can make someone an owner.");
    if (data.customRoleId) await ownedRow(ctx, "custom_roles", data.customRoleId, "id");
    if (member.role === "owner" && data.role !== "owner") {
      const { count } = await ctx.db
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .eq("role", "owner");
      if ((count ?? 0) <= 1) fail("CONFLICT", "An organization must keep at least one owner.");
    }

    const role = data.customRoleId ? "viewer" : data.role;
    await ctx.db
      .from("organization_members")
      .update({ role, custom_role_id: data.customRoleId ?? null })
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId);
    await audit(ctx, {
      action: "team.role_changed",
      resourceType: "member",
      resourceId: data.id,
      before: { role: member.role, customRoleId: member.custom_role_id },
      after: { role: data.customRoleId ? "custom" : data.role, customRoleId: data.customRoleId ?? null },
    });
    return { id: data.id, role };
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
    if (member.user_id === context.userId) fail("CONFLICT", "You cannot remove yourself.");

    await ctx.db.from("organization_members").delete().eq("id", data.id).eq("organization_id", ctx.organizationId);
    await audit(ctx, { action: "team.removed", resourceType: "member", resourceId: data.id, before: { email: member.email } });
    return { id: data.id, removed: true };
  });

/** Suspends (blocks access to the workspace) or reactivates a member without removing them. */
export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "active" | "suspended" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    const member = await ownedRow<{ id: string; role: string; user_id: string | null; status: string; email: string }>(
      ctx,
      "organization_members",
      data.id,
      "id, role, user_id, status, email",
    );
    if (member.role === "owner") fail("CONFLICT", "An owner cannot be suspended.");
    if (member.user_id === context.userId) fail("CONFLICT", "You cannot suspend yourself.");
    if (member.status === "invited") fail("CONFLICT", "Remove a pending invitation instead.");
    await ctx.db
      .from("organization_members")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId);
    await audit(ctx, {
      action: data.status === "suspended" ? "team.suspended" : "team.reactivated",
      resourceType: "member",
      resourceId: data.id,
      after: { email: member.email },
    });
    return { id: data.id, status: data.status };
  });

const rolePermissions = z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).min(1);

export const listRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.read");
    const [{ data: roles }, { data: members }] = await Promise.all([
      ctx.db
        .from("custom_roles")
        .select("id, name, description, permissions, created_at")
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: true }),
      ctx.db.from("organization_members").select("custom_role_id").eq("organization_id", ctx.organizationId),
    ]);
    return (roles ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? "",
      permissions: (r.permissions as string[]) ?? [],
      members: (members ?? []).filter((m) => m.custom_role_id === r.id).length,
    }));
  });

export const saveRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; name: string; description?: string; permissions: string[] }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(40),
        description: z.string().max(200).optional(),
        permissions: rolePermissions,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    // Nobody can hand out a permission they do not hold themselves.
    const missing = data.permissions.filter((p) => !hasPermission(ctx, p as never));
    if (missing.length > 0) fail("AUTHORIZATION_ERROR", `You cannot grant permissions you do not have: ${missing.join(", ")}`);
    const row = {
      organization_id: ctx.organizationId,
      name: data.name,
      description: data.description ?? "",
      permissions: [...new Set(data.permissions)],
      updated_at: new Date().toISOString(),
    };
    const result = data.id
      ? await ctx.db
          .from("custom_roles")
          .update(row)
          .eq("id", data.id)
          .eq("organization_id", ctx.organizationId)
          .select("id")
          .maybeSingle()
      : await ctx.db
          .from("custom_roles")
          .insert({ ...row, created_by: context.userId })
          .select("id")
          .single();
    if (result.error) {
      if (result.error.code === "23505") fail("CONFLICT", "A role with that name already exists.");
      throw new ApiError("INTERNAL_ERROR", "Could not save the role.");
    }
    if (!result.data) fail("RESOURCE_NOT_FOUND", "Role not found.");
    await audit(ctx, {
      action: data.id ? "role.updated" : "role.created",
      resourceType: "role",
      resourceId: result.data.id as string,
      after: { name: data.name, permissions: row.permissions },
    });
    return { id: result.data.id as string };
  });

export const deleteRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "team.manage");
    const role = await ownedRow<{ name: string }>(ctx, "custom_roles", data.id, "name");
    const { count } = await ctx.db
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("custom_role_id", data.id);
    if ((count ?? 0) > 0) fail("CONFLICT", "Move the members using this role to another role first.");
    await ctx.db.from("custom_roles").delete().eq("id", data.id).eq("organization_id", ctx.organizationId);
    await audit(ctx, { action: "role.deleted", resourceType: "role", resourceId: data.id, after: { name: role.name } });
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

async function memberNotificationState(ctx: Ctx, userId: string) {
  const { data } = await ctx.db
    .from("organization_members")
    .select("notifications_read_at, notification_prefs")
    .eq("organization_id", ctx.organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  return {
    readAt: (data?.notifications_read_at as string | null | undefined) ?? null,
    prefs: (data?.notification_prefs as Record<string, unknown> | null | undefined) ?? {},
  };
}

/** Read state is per member: one teammate reading a notification must not clear it for everyone. */
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    const [state, { data }] = await Promise.all([
      memberNotificationState(ctx, context.userId),
      ctx.db
        .from("notifications")
        .select("id, title, body, tone, kind, link, created_at")
        .eq("organization_id", ctx.organizationId)
        .or(`user_id.is.null,user_id.eq.${context.userId}`)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);
    const readAt = state.readAt ? new Date(state.readAt).getTime() : 0;
    return (data ?? [])
      .filter((n) => prefEnabled(state.prefs, (n.kind as string) ?? "activity"))
      .slice(0, 50)
      .map((n) => ({
        id: n.id as string,
        title: n.title as string,
        body: (n.body as string) ?? "",
        tone: n.tone as "success" | "warning" | "danger" | "info",
        kind: (n.kind as string) ?? "activity",
        link: (n.link as string | null) ?? null,
        at: ago(n.created_at as string),
        read: new Date(n.created_at as string).getTime() <= readAt,
      }));
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    await ctx.db
      .from("organization_members")
      .update({ notifications_read_at: new Date().toISOString() })
      .eq("organization_id", ctx.organizationId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    const { prefs } = await memberNotificationState(ctx, context.userId);
    return NOTIFICATION_PREFS.map((p) => ({ ...p, enabled: prefEnabled(prefs, p.key) }));
  });

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prefs: Record<string, boolean> }) =>
    z.object({ prefs: z.record(z.string().max(20), z.boolean()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    const allowed = new Set<string>(NOTIFICATION_PREFS.map((p) => p.key));
    const prefs = Object.fromEntries(Object.entries(data.prefs).filter(([k]) => allowed.has(k)));
    await ctx.db
      .from("organization_members")
      .update({ notification_prefs: prefs })
      .eq("organization_id", ctx.organizationId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const listSecurityEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "open" | "resolved" | "all" } | undefined) =>
    z.object({ status: z.enum(["open", "resolved", "all"]).optional() }).optional().parse(input ?? undefined),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "security.read");
    let query = ctx.db
      .from("security_events")
      .select("id, kind, severity, title, details, actor_label, ip, status, created_at")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data?.status && data.status !== "all") query = query.eq("status", data.status);
    const { data: rows } = await query;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      severity: r.severity as "low" | "medium" | "high",
      title: r.title as string,
      details: JSON.stringify(r.details ?? {}),
      actor: (r.actor_label as string) ?? "",
      ip: (r.ip as string) ?? "",
      status: r.status as "open" | "resolved",
      at: new Date(r.created_at as string).toISOString().replace("T", " ").slice(0, 16) + " UTC",
      ago: ago(r.created_at as string),
    }));
  });

export const resolveSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "open" | "resolved" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["open", "resolved"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "security.manage");
    await ownedRow(ctx, "security_events", data.id, "id");
    await ctx.db
      .from("security_events")
      .update({
        status: data.status,
        resolved_by: data.status === "resolved" ? context.userId : null,
        resolved_at: data.status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId);
    return { id: data.id, status: data.status };
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

type Ctx = Awaited<ReturnType<typeof orgContextForUser>>;

/** Install outcomes over the last 7 days, counted exactly by the database. */
async function eventCounts(ctx: Ctx) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const count = async (type: string) => {
    const { count: n } = await ctx.db
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId)
      .eq("event_type", type)
      .gte("created_at", since);
    return n ?? 0;
  };
  const [successful, failed, rollbacks] = await Promise.all([count("install_succeeded"), count("install_failed"), count("rollback")]);
  return { successful, failed, rollbacks };
}

/** Share of devices seen in the last 7 days that run a release currently published on a channel. */
async function adoptionRate(ctx: Ctx) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: targets } = await ctx.db
    .from("channel_targets")
    .select("release_id")
    .eq("organization_id", ctx.organizationId)
    .not("release_id", "is", null);
  const live = (targets ?? []).map((t) => t.release_id as string);
  const active = ctx.db
    .from("device_installations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .gte("last_seen_at", since);
  const { count: total } = await active;
  if (!total || live.length === 0) return 0;
  const { count: current } = await ctx.db
    .from("device_installations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .gte("last_seen_at", since)
    .in("current_release_id", live);
  return Math.min(100, Math.round(((current ?? 0) / total) * 100));
}

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
      eventCounts(ctx),
    ]);

    // Exact counts (row selects are capped at 1000 by PostgREST).
    const { successful, failed, rollbacks } = events;
    const successRate = successful + failed > 0 ? Number(((successful / (successful + failed)) * 100).toFixed(1)) : 0;
    const adoption = await adoptionRate(ctx);

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
