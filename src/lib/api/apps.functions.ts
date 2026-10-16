/** Applications, platforms and channels. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, orgContextForUser, ownedRow, requirePermission } from "@/lib/backend/context.server";
import { fail } from "@/lib/backend/errors";
import { deleteAppArtifacts } from "@/lib/backend/releases.server";
import { parsePublicKey } from "@/lib/backend/signing";
import { isValidVersion } from "@/lib/backend/versions";
import { dispatchWebhooks } from "@/lib/backend/webhooks.server";

/** Expo-style label: the update's short ID, plus the optional free-form version label. */
function updateLabel(r: { id: string; number: number; version?: string | null }) {
  return `#${r.number} · ${r.id.slice(0, 8)}${r.version ? ` (${r.version})` : ""}`;
}

const DEFAULT_CHANNELS = [
  { name: "production", environment: "production", description: "Live traffic", rollout: 100 },
  { name: "beta", environment: "beta", description: "Opt-in testers", rollout: 100 },
  { name: "staging", environment: "staging", description: "Internal verification", rollout: 100 },
  { name: "development", environment: "development", description: "Developer builds", rollout: 100 },
];

const slugify = (v: string) =>
  v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

async function shapeApps(ctx: Awaited<ReturnType<typeof orgContextForUser>>, appIds?: string[]) {
  let appsQuery = ctx.db
    .from("apps")
    .select(
      "id, name, slug, status, runtime_version, default_channel, firebase_project_id, created_at, code_signing_key_id, code_signing_required",
    )
    .eq("organization_id", ctx.organizationId);
  if (appIds) appsQuery = appsQuery.in("id", appIds);
  const [{ data: apps }, { data: platforms }, { data: channels }, { data: devices }, { data: releases }] = await Promise.all([
    appsQuery.order("created_at", { ascending: true }),
    ctx.db.from("app_platforms").select("app_id, platform, package_name, bundle_identifier, native_version, runtime_version").eq("organization_id", ctx.organizationId),
    ctx.db.from("channels").select("id, app_id, name, active_release_id").eq("organization_id", ctx.organizationId),
    ctx.db.from("device_installations").select("app_id, platform, current_release_id").eq("organization_id", ctx.organizationId),
    ctx.db.from("releases").select("id, app_id, number, version, status, created_at").eq("organization_id", ctx.organizationId).order("number", { ascending: false }),
  ]);

  return (apps ?? []).map((app) => {
    const appPlatforms = (platforms ?? []).filter((p) => p.app_id === app.id);
    const appDevices = (devices ?? []).filter((d) => d.app_id === app.id);
    const appReleases = (releases ?? []).filter((r) => r.app_id === app.id);
    const latestPublished = appReleases.find((r) => r.status === "published");
    const android = appDevices.filter((d) => d.platform === "android");
    const ios = appDevices.filter((d) => d.platform === "ios");
    const updateRate = (list: typeof appDevices) =>
      list.length === 0 ? 0 : Number(((list.filter((d) => d.current_release_id).length / list.length) * 100).toFixed(0));

    return {
      id: app.id as string,
      name: app.name as string,
      slug: app.slug as string,
      platforms: appPlatforms.map((p) => p.platform as "android" | "ios"),
      androidPackage: (appPlatforms.find((p) => p.platform === "android")?.package_name as string) ?? "",
      iosBundleId: (appPlatforms.find((p) => p.platform === "ios")?.bundle_identifier as string) ?? "",
      runtimeVersion: app.runtime_version as string,
      channels: (channels ?? []).filter((c) => c.app_id === app.id).map((c) => c.name as string),
      currentRelease: latestPublished
        ? updateLabel({ id: latestPublished.id as string, number: latestPublished.number as number, version: latestPublished.version as string })
        : "—",
      codeSigning: {
        keyId: (app.code_signing_key_id as string | null) ?? null,
        required: Boolean(app.code_signing_required),
      },
      status: app.status as "active" | "paused" | "setup",
      firebaseProjectId: (app.firebase_project_id as string) ?? "",
      devices: { android: android.length, ios: ios.length },
      updateRate: { android: updateRate(android), ios: updateRate(ios) },
    };
  });
}

export const listApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "app.read");
    return shapeApps(ctx);
  });

export const getApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "app.read");
    const { data: row } = await ctx.db
      .from("apps")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .or(`slug.eq.${data.id},id.eq.${/^[0-9a-f-]{36}$/i.test(data.id) ? data.id : "00000000-0000-0000-0000-000000000000"}`)
      .maybeSingle();
    if (!row) fail("RESOURCE_NOT_FOUND", "Application not found.");
    const [app] = await shapeApps(ctx, [row.id as string]);
    if (!app) fail("RESOURCE_NOT_FOUND", "Application not found.");
    return app;
  });

export const createApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      slug?: string;
      firebaseProjectId?: string;
      runtimeVersion: string;
      platforms: { platform: "android" | "ios"; packageName?: string; bundleIdentifier?: string; nativeVersion: string }[];
    }) =>
      z
        .object({
          name: z.string().min(2).max(80),
          slug: z.string().max(48).optional(),
          firebaseProjectId: z.string().uuid().optional(),
          runtimeVersion: z.string().min(1).max(40),
          platforms: z
            .array(
              z.object({
                platform: z.enum(["android", "ios"]),
                packageName: z.string().max(160).optional(),
                bundleIdentifier: z.string().max(160).optional(),
                nativeVersion: z.string().min(1).max(40),
              }),
            )
            .min(1),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "app.create");
    if (!isValidVersion(data.runtimeVersion)) fail("INVALID_RUNTIME", "Runtime version must look like 1.2.3.");

    if (data.firebaseProjectId) {
      await ownedRow(ctx, "firebase_projects", data.firebaseProjectId, "id");
    }

    const slug = slugify(data.slug ?? data.name) || `app-${Date.now()}`;
    const { data: app, error } = await ctx.db
      .from("apps")
      .insert({
        organization_id: ctx.organizationId,
        firebase_project_id: data.firebaseProjectId ?? null,
        name: data.name,
        slug,
        runtime_version: data.runtimeVersion,
        status: "active",
        created_by: context.userId,
      })
      .select("id, name, slug")
      .single();
    if (error) fail("CONFLICT", "An application with that identifier already exists.");

    await ctx.db.from("app_platforms").insert(
      data.platforms.map((p) => ({
        organization_id: ctx.organizationId,
        app_id: app.id,
        platform: p.platform,
        package_name: p.packageName ?? null,
        bundle_identifier: p.bundleIdentifier ?? null,
        native_version: p.nativeVersion,
        runtime_version: data.runtimeVersion,
      })),
    );

    await ctx.db.from("channels").insert(
      DEFAULT_CHANNELS.map((c) => ({
        organization_id: ctx.organizationId,
        app_id: app.id,
        name: c.name,
        environment: c.environment,
        description: c.description,
        platform: "all",
        rollout_percentage: c.rollout,
        status: "empty",
        update_policy: c.name === "production" ? "staged" : "immediate",
      })),
    );

    await audit(ctx, { action: "app.created", resourceType: "app", resourceId: app.id, appId: app.id, appName: app.name, after: { slug } });
    await dispatchWebhooks(ctx.db, ctx.organizationId, "app.created", { appId: app.id, name: app.name, slug });
    return { id: app.id as string, name: app.name as string, slug: app.slug as string };
  });

export const updateApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name?: string; status?: "active" | "paused"; runtimeVersion?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(2).max(80).optional(),
        status: z.enum(["active", "paused"]).optional(),
        runtimeVersion: z.string().min(1).max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "app.update");
    const before = await ownedRow<{ name: string; status: string; runtime_version: string }>(
      ctx,
      "apps",
      data.id,
      "name, status, runtime_version",
    );
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.status !== undefined) patch["status"] = data.status;
    if (data.runtimeVersion !== undefined) patch["runtime_version"] = data.runtimeVersion;

    await ctx.db.from("apps").update(patch).eq("id", data.id).eq("organization_id", ctx.organizationId);
    await audit(ctx, { action: "app.updated", resourceType: "app", resourceId: data.id, appId: data.id, appName: before.name, before, after: patch });
    return { id: data.id, ...patch };
  });

async function shapeChannels(ctx: Awaited<ReturnType<typeof orgContextForUser>>, appId?: string) {
  let query = ctx.db
    .from("channels")
    .select(
      "id, app_id, name, environment, description, platform, active_release_id, rollout_percentage, status, update_policy, updated_at",
    )
    .eq("organization_id", ctx.organizationId);
  if (appId) query = query.eq("app_id", appId);

  const [{ data: channels }, { data: apps }, { data: releases }, { data: deployments }] = await Promise.all([
    query.order("created_at", { ascending: true }),
    ctx.db.from("apps").select("id, name").eq("organization_id", ctx.organizationId),
    ctx.db.from("releases").select("id, number, version, status").eq("organization_id", ctx.organizationId),
    ctx.db
      .from("deployments")
      .select("channel_id, release_id, created_at, type")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const appName = (id: string) => (apps ?? []).find((a) => a.id === id)?.name ?? "";
  const release = (id: string | null) => (releases ?? []).find((r) => r.id === id);

  return (channels ?? []).map((c) => {
    const active = release(c.active_release_id as string | null);
    return {
      id: c.id as string,
      name: c.name as string,
      environment: c.environment as "production" | "beta" | "staging" | "development",
      description: (c.description as string) ?? "",
      appId: c.app_id as string,
      appName: appName(c.app_id as string),
      platform: c.platform as "android" | "ios" | "all",
      currentRelease: active
        ? updateLabel({ id: active.id as string, number: active.number as number, version: active.version as string })
        : "—",
      activeReleaseId: (c.active_release_id as string | null) ?? null,
      rollout: Number(c.rollout_percentage ?? 0),
      status: c.status as "active" | "paused" | "empty",
      updatedAt: new Date(c.updated_at as string).toISOString().slice(0, 16).replace("T", " "),
      updatePolicy: (c.update_policy as string) ?? "",
      history: (deployments ?? [])
        .filter((d) => d.channel_id === c.id)
        .slice(0, 8)
        .map((d) => {
          const rel = release(d.release_id as string | null);
          return {
            release: rel ? `#${rel.number}` : "—",
            version: rel?.version ?? "",
            at: new Date(d.created_at as string).toISOString().slice(0, 16).replace("T", " "),
            status: (rel?.status ?? "draft") as never,
          };
        }),
    };
  });
}

export const listChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { appId?: string } | undefined) =>
    z.object({ appId: z.string().uuid().optional() }).optional().parse(input ?? undefined),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "channel.read");
    return shapeChannels(ctx, data?.appId);
  });

export const getChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "channel.read");
    const row = await ownedRow<{ app_id: string }>(ctx, "channels", data.id, "app_id");
    const found = (await shapeChannels(ctx, row.app_id)).find((c) => c.id === data.id);
    if (!found) fail("RESOURCE_NOT_FOUND", "Channel not found.");
    return found;
  });

/**
 * Deletes an application with its channels, releases and telemetry (admins and owners).
 * Confirmed by typing the app slug. Stored bundles are removed from Firebase best-effort.
 */
export const deleteApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; confirmSlug: string }) =>
    z.object({ id: z.string().uuid(), confirmSlug: z.string().max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "app.delete");
    const app = await ownedRow<{ id: string; name: string; slug: string }>(ctx, "apps", data.id, "id, name, slug");
    if (data.confirmSlug !== app.slug) fail("INVALID_INPUT", "Type the application ID exactly to confirm.");

    const artifacts = await deleteAppArtifacts(ctx, app.id);
    const { error } = await ctx.db.from("apps").delete().eq("id", app.id).eq("organization_id", ctx.organizationId);
    if (error) fail("CONFLICT", "The application could not be deleted.");
    await audit(ctx, {
      action: "app.deleted",
      resourceType: "app",
      resourceId: app.id,
      appName: app.name,
      before: { slug: app.slug },
      after: { artifactsRemoved: artifacts.removed, artifactsKept: artifacts.kept },
    });
    await dispatchWebhooks(ctx.db, ctx.organizationId, "app.deleted", { appId: app.id, slug: app.slug });
    return { id: app.id, deleted: true, artifactsRemoved: artifacts.removed, artifactsKept: artifacts.kept };
  });

/** Registers (or clears) the app's code signing public key and whether signatures are required. */
export const setAppSigning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; publicKeyPem?: string | null; required: boolean }) =>
    z
      .object({ id: z.string().uuid(), publicKeyPem: z.string().max(4000).nullable().optional(), required: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "app.update");
    const app = await ownedRow<{ name: string; code_signing_public_key: string | null; code_signing_required: boolean }>(
      ctx,
      "apps",
      data.id,
      "name, code_signing_public_key, code_signing_required",
    );
    const patch: Record<string, unknown> = {};
    if (data.publicKeyPem !== undefined) {
      if (data.publicKeyPem) {
        let parsed: { pem: string; keyId: string };
        try {
          parsed = parsePublicKey(data.publicKeyPem);
        } catch (error) {
          fail("INVALID_INPUT", error instanceof Error ? error.message : "Invalid public key.");
        }
        patch["code_signing_public_key"] = parsed.pem;
        patch["code_signing_key_id"] = parsed.keyId;
      } else {
        patch["code_signing_public_key"] = null;
        patch["code_signing_key_id"] = null;
      }
    }
    const hasKey = data.publicKeyPem !== undefined ? Boolean(data.publicKeyPem) : Boolean(app.code_signing_public_key);
    if (data.required && !hasKey) fail("INVALID_INPUT", "Add a public key before requiring signed updates.");
    patch["code_signing_required"] = data.required && hasKey;

    await ctx.db.from("apps").update(patch).eq("id", data.id).eq("organization_id", ctx.organizationId);
    await audit(ctx, {
      action: "app.signing_updated",
      resourceType: "app",
      resourceId: data.id,
      appId: data.id,
      appName: app.name,
      before: { required: app.code_signing_required, hasKey: Boolean(app.code_signing_public_key) },
      after: { required: patch["code_signing_required"], keyId: patch["code_signing_key_id"] ?? undefined },
    });
    return {
      id: data.id,
      keyId: (patch["code_signing_key_id"] as string | null | undefined) ?? null,
      required: Boolean(patch["code_signing_required"]),
    };
  });

/**
 * Store builds by runtime version (Expo's model): every OTA update targets exactly one
 * runtime, and devices report the runtime they run, so each runtime shows its updates
 * and its installed base.
 */
export const listRuntimes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { appId: string }) => z.object({ appId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "release.read");
    const app = await ownedRow<{ runtime_version: string }>(ctx, "apps", data.appId, "runtime_version");
    const [{ data: releases }, { data: devices }, { data: platforms }] = await Promise.all([
      ctx.db
        .from("releases")
        .select("id, number, version, runtime_version, platform, status, release_notes, created_at")
        .eq("organization_id", ctx.organizationId)
        .eq("app_id", data.appId)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(500),
      ctx.db
        .from("device_installations")
        .select("runtime_version, platform")
        .eq("organization_id", ctx.organizationId)
        .eq("app_id", data.appId)
        .limit(10000),
      ctx.db.from("app_platforms").select("platform, runtime_version").eq("app_id", data.appId),
    ]);
    const runtimes = new Set<string>([app.runtime_version]);
    for (const p of platforms ?? []) if (p.runtime_version) runtimes.add(p.runtime_version as string);
    for (const r of releases ?? []) runtimes.add(r.runtime_version as string);
    for (const d of devices ?? []) if (d.runtime_version) runtimes.add(d.runtime_version as string);

    return [...runtimes]
      .map((runtime) => {
        const updates = (releases ?? []).filter((r) => r.runtime_version === runtime);
        const onRuntime = (devices ?? []).filter((d) => d.runtime_version === runtime);
        return {
          runtimeVersion: runtime,
          isCurrent: runtime === app.runtime_version,
          devices: {
            android: onRuntime.filter((d) => d.platform === "android").length,
            ios: onRuntime.filter((d) => d.platform === "ios").length,
          },
          updates: updates.slice(0, 20).map((r) => ({
            id: r.id as string,
            label: updateLabel({ id: r.id as string, number: r.number as number, version: r.version as string }),
            platform: r.platform as "android" | "ios",
            status: r.status as string,
            message: (r.release_notes as string) ?? "",
            createdAt: new Date(r.created_at as string).toISOString().slice(0, 16).replace("T", " "),
          })),
          updateCount: updates.length,
        };
      })
      .sort((a, b) =>
        a.isCurrent === b.isCurrent
          ? b.runtimeVersion.localeCompare(a.runtimeVersion, undefined, { numeric: true })
          : a.isCurrent
            ? -1
            : 1,
      );
  });

const channelName = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and dashes.");
const environmentEnum = z.enum(["production", "beta", "staging", "development"]);

export const createChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { appId: string; name: string; environment: string; description?: string; platform?: string; updatePolicy?: string }) =>
      z
        .object({
          appId: z.string().uuid(),
          name: channelName,
          environment: environmentEnum,
          description: z.string().max(200).optional(),
          platform: z.enum(["all", "android", "ios"]).optional(),
          updatePolicy: z.enum(["immediate", "staged"]).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "channel.create");
    const app = await ownedRow<{ name: string }>(ctx, "apps", data.appId, "name");
    const { data: row, error } = await ctx.db
      .from("channels")
      .insert({
        organization_id: ctx.organizationId,
        app_id: data.appId,
        name: data.name,
        environment: data.environment,
        description: data.description ?? "",
        platform: data.platform ?? "all",
        rollout_percentage: 100,
        status: "empty",
        update_policy: data.updatePolicy ?? (data.environment === "production" ? "staged" : "immediate"),
      })
      .select("id")
      .single();
    if (error) fail("CONFLICT", "This application already has a channel with that name.");
    await audit(ctx, {
      action: "channel.created",
      resourceType: "channel",
      resourceId: row.id as string,
      appId: data.appId,
      appName: app.name,
      after: { name: data.name, environment: data.environment },
    });
    await dispatchWebhooks(ctx.db, ctx.organizationId, "channel.created", { channelId: row.id, appId: data.appId, name: data.name });
    return { id: row.id as string };
  });

export const updateChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      name?: string;
      environment?: string;
      description?: string;
      status?: "active" | "paused";
      updatePolicy?: string;
    }) =>
      z
        .object({
          id: z.string().uuid(),
          name: channelName.optional(),
          environment: environmentEnum.optional(),
          description: z.string().max(200).optional(),
          status: z.enum(["active", "paused"]).optional(),
          updatePolicy: z.enum(["immediate", "staged"]).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "channel.update");
    const channel = await ownedRow<{ name: string; app_id: string; status: string; active_release_id: string | null }>(
      ctx,
      "channels",
      data.id,
      "name, app_id, status, active_release_id",
    );
    const { data: app } = await ctx.db.from("apps").select("name, default_channel").eq("id", channel.app_id).maybeSingle();
    if (data.name && data.name !== channel.name && app?.default_channel === channel.name) {
      fail("CONFLICT", "The app's default channel cannot be renamed.");
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.environment !== undefined) patch["environment"] = data.environment;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.updatePolicy !== undefined) patch["update_policy"] = data.updatePolicy;
    // "paused" stops the channel serving updates; resuming restores active/empty.
    if (data.status !== undefined) {
      patch["status"] = data.status === "paused" ? "paused" : channel.active_release_id ? "active" : "empty";
    }

    const { error } = await ctx.db.from("channels").update(patch).eq("id", data.id).eq("organization_id", ctx.organizationId);
    if (error) fail("CONFLICT", "This application already has a channel with that name.");
    await audit(ctx, {
      action: "channel.updated",
      resourceType: "channel",
      resourceId: data.id,
      appId: channel.app_id,
      appName: (app?.name as string) ?? "",
      before: { name: channel.name, status: channel.status },
      after: { ...patch, name: data.name ?? channel.name },
    });
    await dispatchWebhooks(ctx.db, ctx.organizationId, "channel.updated", { channelId: data.id, ...patch });
    return { id: data.id };
  });

export const deleteChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "channel.delete");
    const channel = await ownedRow<{ name: string; app_id: string }>(ctx, "channels", data.id, "name, app_id");
    const { data: app } = await ctx.db.from("apps").select("name, default_channel").eq("id", channel.app_id).maybeSingle();
    if (app?.default_channel === channel.name) fail("CONFLICT", "The app's default channel cannot be deleted.");
    const { data: serving } = await ctx.db
      .from("channel_targets")
      .select("release_id")
      .eq("channel_id", data.id)
      .not("release_id", "is", null)
      .limit(1);
    if (serving && serving.length > 0) fail("CONFLICT", "This channel is serving an update. Roll it back or archive it first.");

    await ctx.db.from("channels").delete().eq("id", data.id).eq("organization_id", ctx.organizationId);
    await audit(ctx, {
      action: "channel.deleted",
      resourceType: "channel",
      resourceId: data.id,
      appId: channel.app_id,
      appName: (app?.name as string) ?? "",
      after: { name: channel.name },
    });
    await dispatchWebhooks(ctx.db, ctx.organizationId, "channel.deleted", { channelId: data.id, name: channel.name });
    return { id: data.id, removed: true };
  });
