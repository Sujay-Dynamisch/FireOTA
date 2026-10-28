/**
 * Firebase connection lifecycle: Google OAuth start, project discovery,
 * verification, re-authorization and disconnect.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, orgContextForUser, requirePermission, type OrgContext } from "@/lib/backend/context.server";
import { describeLive, liveReleases, shortList } from "@/lib/backend/delete-guards.server";

/**
 * Apps that use a Firebase project block removing it (their bundles live in its bucket).
 * The message names them and says whether their live updates must be archived first.
 */
async function assertProjectUnused(ctx: OrgContext, projectId: string) {
  const { data: apps } = await ctx.db
    .from("apps")
    .select("id, name")
    .eq("organization_id", ctx.organizationId)
    .eq("firebase_project_id", projectId);
  if (!apps || apps.length === 0) return;
  const names = shortList(apps.map((a) => a.name as string));
  const one = apps.length === 1;
  const live = await liveReleases(
    ctx,
    apps.map((a) => a.id as string),
  );
  fail(
    "CONFLICT",
    live.length > 0
      ? `Used by ${names}. Archive the ${describeLive(live)}, delete the ${one ? "app" : "apps"}, then remove the project.`
      : `Used by ${names}. Delete the ${one ? "app" : "apps"} first, then remove the project.`,
    { apps: apps.map((a) => ({ id: a.id, name: a.name })), liveReleases: live },
  );
}
import { ApiError, fail } from "@/lib/backend/errors";
import { pkcePair, randomToken } from "@/lib/backend/crypto.server";
import {
  accessTokenFromConnection,
  authorizationUrl,
  listProjects,
  projectHealth,
} from "@/lib/backend/firebase.server";
import { dispatchWebhooks } from "@/lib/backend/webhooks.server";

function origin() {
  const request = getRequest();
  return new URL(request.url).origin;
}

/** Step 1 of connecting: hand the browser a Google consent URL bound to a one-time state. */
export const startFirebaseAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.connect");

    const state = randomToken(24);
    const { verifier, challenge } = pkcePair();
    const { error: stateError } = await ctx.db.from("oauth_states").insert({
      state,
      organization_id: ctx.organizationId,
      user_id: context.userId,
      code_verifier: verifier,
      redirect_to: "/projects",
    });
    // Without a stored state the callback can only report "expired"; fail here instead.
    if (stateError) fail("FIREBASE_CONNECTION_ERROR", "Could not start Google authorization. Try again.");
    await audit(ctx, { action: "firebase.authorization_started", resourceType: "firebase_connection" });
    return { url: authorizationUrl({ state, challenge, origin: origin() }) };
  });

/** Projects the connected Google account can see, for the selection step. */
export const listSelectableProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.read");
    const { data: connection } = await ctx.db
      .from("firebase_connections")
      .select("id, refresh_token_ciphertext, google_account")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!connection) fail("FIREBASE_CONNECTION_ERROR", "Authorize a Google account first.");

    const accessToken = await accessTokenFromConnection(connection.refresh_token_ciphertext as string | null);
    const [projects, { data: existing }] = await Promise.all([
      listProjects(accessToken),
      ctx.db.from("firebase_projects").select("firebase_project_id").eq("organization_id", ctx.organizationId),
    ]);
    // Projects this workspace already connected are listed but can't be picked again.
    const connected = new Set((existing ?? []).map((row) => row.firebase_project_id as string));
    return {
      googleAccount: connection.google_account as string,
      projects: projects.map((p) => ({
        id: p.projectId,
        name: p.displayName,
        region: p.storageBucket ?? "",
        connected: connected.has(p.projectId),
      })),
    };
  });

/** Step 2: attach one discovered Firebase project to the organization and verify it. */
export const connectProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firebaseProjectId: string }) =>
    z.object({ firebaseProjectId: z.string().min(3).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.connect");

    const { data: connection } = await ctx.db
      .from("firebase_connections")
      .select("id, refresh_token_ciphertext, google_account, scopes")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!connection) fail("FIREBASE_CONNECTION_ERROR", "Authorize a Google account first.");

    const accessToken = await accessTokenFromConnection(connection.refresh_token_ciphertext as string | null);
    const health = await projectHealth(accessToken, data.firebaseProjectId);

    const { data: row, error } = await ctx.db
      .from("firebase_projects")
      .upsert(
        {
          organization_id: ctx.organizationId,
          firebase_connection_id: connection.id,
          firebase_project_id: data.firebaseProjectId,
          project_number: health.projectNumber,
          display_name: health.displayName,
          storage_bucket: health.storageBucket,
          storage_enabled: health.storage,
          google_account: connection.google_account,
          permissions: health.permissions,
          status: health.status,
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,firebase_project_id" },
      )
      .select("id, firebase_project_id, display_name")
      .single();
    if (error) fail("FIREBASE_CONNECTION_ERROR", "Could not save this Firebase project.");

    await audit(ctx, {
      action: "firebase.project_connected",
      resourceType: "firebase_project",
      resourceId: row.id,
      after: { projectId: data.firebaseProjectId, displayName: health.displayName, storage: health.storage },
    });

    return { id: row.id, firebaseProjectId: row.firebase_project_id, name: row.display_name, status: health.status };
  });

/** The database distinguishes why a connection is unhealthy; the UI shows four states. */
function uiStatus(status: string): "connected" | "degraded" | "expired" | "disconnected" {
  if (status === "auth_expired") return "expired";
  if (status === "permission_error") return "degraded";
  if (status === "connected" || status === "degraded" || status === "disconnected") return status;
  return "degraded";
}

export const listFirebaseProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.read");
    const { data } = await ctx.db
      .from("firebase_projects")
      .select(
        "id, firebase_project_id, display_name, storage_bucket, storage_enabled, status, last_verified_at, google_account, permissions",
      )
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: true });

    const counts = await ctx.db.from("apps").select("firebase_project_id").eq("organization_id", ctx.organizationId);

    return (data ?? []).map((p) => ({
      id: p.id as string,
      name: p.display_name as string,
      firebaseId: p.firebase_project_id as string,
      storageBucket: (p.storage_bucket as string) ?? "",
      storage: p.storage_enabled ? ("enabled" as const) : ("disabled" as const),
      apps: (counts.data ?? []).filter((a) => a.firebase_project_id === p.id).length,
      status: uiStatus(p.status as string),
      lastVerified: p.last_verified_at ? new Date(p.last_verified_at as string).toISOString().slice(0, 16).replace("T", " ") : "never",
      googleAccount: (p.google_account as string) ?? "",
      // Projects verified before Firestore was dropped still store a "Firestore access" entry.
      permissions: ((p.permissions as { label: string; granted: boolean; optional?: boolean; reason?: string }[]) ?? []).filter(
        (permission) => permission.label !== "Firestore access",
      ),
    }));
  });

export const verifyFirebaseProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.read");
    const { data: project } = await ctx.db
      .from("firebase_projects")
      .select("id, firebase_project_id, firebase_connection_id")
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!project) fail("RESOURCE_NOT_FOUND", "That Firebase project is not connected.");

    const { data: connection } = await ctx.db
      .from("firebase_connections")
      .select("refresh_token_ciphertext")
      .eq("id", project.firebase_connection_id ?? "")
      .maybeSingle();

    try {
      const accessToken = await accessTokenFromConnection(connection?.refresh_token_ciphertext as string | null);
      const health = await projectHealth(accessToken, project.firebase_project_id as string);
      await ctx.db
        .from("firebase_projects")
        .update({
          storage_bucket: health.storageBucket,
          storage_enabled: health.storage,
          permissions: health.permissions,
          status: health.status === "connected" ? "connected" : "degraded",
          last_verified_at: new Date().toISOString(),
        })
        .eq("id", project.id);
      await audit(ctx, { action: "firebase.verified", resourceType: "firebase_project", resourceId: project.id, after: health.permissions });
      return { id: project.id, status: health.status === "connected" ? ("connected" as const) : ("degraded" as const), verifiedAt: "just now" };
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null;
      const status =
        code === "FIREBASE_AUTH_EXPIRED" ? "auth_expired" : code === "FIREBASE_PERMISSION_ERROR" ? "permission_error" : "degraded";
      await ctx.db
        .from("firebase_projects")
        .update({ status, last_verified_at: new Date().toISOString() })
        .eq("id", project.id);
      await audit(ctx, { action: "firebase.verification_failed", resourceType: "firebase_project", resourceId: project.id, result: "failure" });
      await dispatchWebhooks(ctx.db, ctx.organizationId, "firebase.expired", { firebaseProjectId: project.id });
      throw error;
    }
  });

export const disconnectFirebaseProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.disconnect");
    await assertProjectUnused(ctx, data.id);

    await ctx.db.from("firebase_projects").update({ status: "disconnected" }).eq("id", data.id).eq("organization_id", ctx.organizationId);
    await audit(ctx, { action: "firebase.disconnected", resourceType: "firebase_project", resourceId: data.id });
    await dispatchWebhooks(ctx.db, ctx.organizationId, "firebase.disconnected", { firebaseProjectId: data.id });
    return { id: data.id, status: "disconnected" as const };
  });

/**
 * Removes a Firebase project from the workspace entirely (admins and owners). Files already
 * in the project's Storage bucket are left untouched — they belong to the customer.
 */
export const removeFirebaseProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "project.delete");
    const { data: project } = await ctx.db
      .from("firebase_projects")
      .select("id, display_name")
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!project) fail("RESOURCE_NOT_FOUND", "Firebase project not found.");
    await assertProjectUnused(ctx, data.id);

    const { error } = await ctx.db.from("firebase_projects").delete().eq("id", data.id).eq("organization_id", ctx.organizationId);
    if (error) fail("CONFLICT", "The project could not be removed.");
    await audit(ctx, {
      action: "firebase.removed",
      resourceType: "firebase_project",
      resourceId: data.id,
      after: { displayName: project.display_name },
    });
    await dispatchWebhooks(ctx.db, ctx.organizationId, "firebase.disconnected", { firebaseProjectId: data.id, removed: true });
    return { id: data.id, removed: true };
  });
