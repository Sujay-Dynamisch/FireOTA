/**
 * Integration tests against a real Supabase project (the one in .env).
 * They create throwaway users/organizations prefixed with the run id and delete them afterwards.
 *
 * Firebase is not contacted: releases are inserted in the state an upload would leave them
 * (ready + hash + storage path), so the publish/OTA/rollback engine is exercised end to end
 * without customer Storage. The upload step itself needs a Firebase test project (see TESTING.md).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contextFromApiKey } from "@/lib/backend/apikeys.server";
import { orgContextForUser, type OrgContext } from "@/lib/backend/context.server";
import { generateApiKey } from "@/lib/backend/crypto.server";
import { ApiError } from "@/lib/backend/errors";
import { evaluateRollbackThreshold, recordEvent, updateCheck } from "@/lib/backend/ota.server";
import {
  archiveRelease,
  createRelease,
  deleteRelease,
  pauseRelease,
  publishRelease,
  resumeRelease,
  rollbackRelease,
  setRolloutPercentage,
} from "@/lib/backend/releases.server";
import { inRollout } from "@/lib/backend/versions";
import { dispatchWebhooks } from "@/lib/backend/webhooks.server";

const url = process.env["SUPABASE_URL"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const configured = Boolean(url && serviceKey && anonKey && process.env["FIREOTA_ENCRYPTION_KEY"]);

const run = `t${Date.now().toString(36)}`;
const password = `Fx!${crypto.randomUUID()}`;
const db: SupabaseClient = configured ? createClient(url, serviceKey, { auth: { persistSession: false } }) : (null as never);

type Ids = Record<string, string>;
const users: Ids = {};
const orgs: Ids = {};
const ids: Ids = {};

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}, but the call succeeded`);
}

async function createUser(key: string) {
  const { data, error } = await db.auth.admin.createUser({
    email: `${run}-${key}@fireota.test`,
    password,
    email_confirm: true,
    user_metadata: { name: `${run} ${key}` },
  });
  if (error) throw error;
  users[key] = data.user.id;
}

async function createOrg(key: string, owner: string) {
  const { data, error } = await db
    .from("organizations")
    .insert({ name: `${run} ${key}`, slug: `${run}-${key}`, created_by: users[owner] })
    .select("id")
    .single();
  if (error) throw error;
  orgs[key] = data.id;
  await addMember(key, owner, "owner");
}

async function addMember(org: string, user: string, role: string) {
  const { error } = await db.from("organization_members").insert({
    organization_id: orgs[org],
    user_id: users[user],
    email: `${run}-${user}@fireota.test`,
    name: user,
    role,
    status: "active",
  });
  if (error) throw error;
}

async function createApp(org: string, key: string, slug: string, withProject: boolean) {
  let projectId: string | null = null;
  if (withProject) {
    const { data } = await db
      .from("firebase_projects")
      .insert({
        organization_id: orgs[org],
        firebase_project_id: `${run}-${key}`,
        display_name: "Test project",
        storage_bucket: `${run}-${key}.appspot.com`,
        storage_enabled: true,
        status: "connected",
      })
      .select("id")
      .single();
    projectId = data!.id;
  }
  const { data: app, error } = await db
    .from("apps")
    .insert({ organization_id: orgs[org], firebase_project_id: projectId, name: key, slug, status: "active", runtime_version: "1.4.0" })
    .select("id")
    .single();
  if (error) throw error;
  ids[`app_${key}`] = app.id;
  await db.from("app_platforms").insert([
    { organization_id: orgs[org], app_id: app.id, platform: "android", package_name: "com.test.app", native_version: "1.4.2", runtime_version: "1.4.0" },
    { organization_id: orgs[org], app_id: app.id, platform: "ios", bundle_identifier: "com.test.app", native_version: "1.4.2", runtime_version: "1.4.0" },
  ]);
  const { data: channels } = await db
    .from("channels")
    .insert(
      ["production", "staging"].map((name) => ({
        organization_id: orgs[org],
        app_id: app.id,
        name,
        environment: name,
        status: "empty",
      })),
    )
    .select("id, name");
  for (const c of channels ?? []) ids[`ch_${key}_${c.name}`] = c.id;
}

/** Inserts a release exactly as a successful upload leaves it. */
async function readyRelease(
  org: string,
  app: string,
  number: number,
  opts: { platform?: "android" | "ios"; version?: string; runtime?: string; native?: string; channel?: string } = {},
) {
  const appId = ids[`app_${app}`]!;
  const { data, error } = await db
    .from("releases")
    .insert({
      organization_id: orgs[org],
      app_id: appId,
      channel_id: ids[`ch_${app}_${opts.channel ?? "production"}`],
      // Offset so these never collide with numbers allocated by createRelease.
      number: 100 + number,
      platform: opts.platform ?? "android",
      version: opts.version ?? `1.4.${number}`,
      runtime_version: opts.runtime ?? "1.4.0",
      native_version_constraint: opts.native ?? "*",
      status: "ready",
      bundle_hash: `${number}`.padStart(64, "a"),
      bundle_size: 1000 + number,
      storage_path: `fireota/apps/${appId}/android/x/releases/r${number}/bundle.hbc#token-${number}`,
      created_by_label: "test",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const device = (overrides: Partial<Parameters<typeof updateCheck>[1]> = {}) => ({
  appKey: ids["app_main"]!,
  channelName: "production",
  platform: "android" as const,
  installationId: `${run}-device-0001`,
  runtimeVersion: "1.4.0",
  nativeVersion: "1.4.2",
  ...overrides,
});

let owner: OrgContext;
let other: OrgContext;

describe.skipIf(!configured)("FireOTA release engine against Supabase", () => {
  beforeAll(async () => {
    for (const u of ["owner", "admin", "manager", "developer", "viewer", "other"]) await createUser(u);
    await createOrg("a", "owner");
    await createOrg("b", "other");
    await addMember("a", "admin", "admin");
    await addMember("a", "manager", "release_manager");
    await addMember("a", "developer", "developer");
    await addMember("a", "viewer", "viewer");
    await createApp("a", "main", `${run}-shared`, true);
    await createApp("b", "foreign", `${run}-shared`, true);
    owner = await orgContextForUser(users["owner"]!);
    other = await orgContextForUser(users["other"]!);
  });

  afterAll(async () => {
    if (!configured) return;
    // Clear release references first: a single cascading delete would both update (SET NULL) and
    // delete the same channel rows, which Postgres rejects, leaving the test data behind.
    for (const org of Object.values(orgs)) {
      await db.from("channels").update({ active_release_id: null }).eq("organization_id", org);
      await db.from("channel_targets").delete().eq("organization_id", org);
      await db.from("releases").delete().eq("organization_id", org);
      const { error } = await db.from("organizations").delete().eq("id", org);
      if (error) console.error(`cleanup failed for organization ${org}: ${error.message}`);
    }
    for (const user of Object.values(users)) {
      await db.from("profiles").delete().eq("id", user);
      await db.auth.admin.deleteUser(user);
    }
    await db.from("rate_limit_hits").delete().like("bucket", `%${run}%`);
  });

  it("serves nothing before anything is published", async () => {
    const result = await updateCheck(db, device());
    expect(result).toMatchObject({ updateAvailable: false, reason: "no_release" });
  });

  it("rejects publishing a draft and malformed releases", async () => {
    await expectCode(
      createRelease(owner, { appId: ids["app_main"]!, channelName: "production", platform: "android", version: "1.4.0", runtimeVersion: "latest" }),
      "INVALID_RUNTIME",
    );
    await expectCode(
      createRelease(owner, { appId: ids["app_main"]!, channelName: "nope", platform: "android", version: "1.4.0", runtimeVersion: "1.4.0" }),
      "INVALID_CHANNEL",
    );
    const draft = await createRelease(owner, {
      appId: ids["app_main"]!,
      channelName: "staging",
      platform: "android",
      version: "9.9.9",
      runtimeVersion: "1.4.0",
      idempotencyKey: `${run}-idem`,
    });
    expect(draft.status).toBe("draft");
    const again = await createRelease(owner, {
      appId: ids["app_main"]!,
      channelName: "staging",
      platform: "android",
      version: "9.9.9",
      runtimeVersion: "1.4.0",
      idempotencyKey: `${run}-idem`,
    });
    expect(again.id).toBe(draft.id);
    await expectCode(publishRelease(owner, { releaseId: draft.id, rolloutPercentage: 100 }), "RELEASE_NOT_READY");
    ids["draft"] = draft.id;
  });

  it("publishes a release and serves it to a compatible device", async () => {
    ids["r1"] = await readyRelease("a", "main", 1);
    const published = await publishRelease(owner, { releaseId: ids["r1"], rolloutPercentage: 100 });
    expect(published.status).toBe("published");

    const result = await updateCheck(db, device());
    expect(result.updateAvailable).toBe(true);
    expect(result.release?.id).toBe(ids["r1"]);
    expect(result.release?.bundle.hash).toHaveLength(64);
    expect(result.release?.bundle.url).toContain(`${run}-main.appspot.com`);
    expect(result.release?.bundle.url).toContain("token=token-1");
    expect(JSON.stringify(result)).not.toMatch(/refresh|secret|organization/i);

    await expectCode(publishRelease(owner, { releaseId: ids["r1"], rolloutPercentage: 100 }), "RELEASE_ALREADY_PUBLISHED");
  });

  it("applies runtime, native, platform and up-to-date rules", async () => {
    expect(await updateCheck(db, device({ runtimeVersion: "1.5.0" }))).toMatchObject({ reason: "runtime_incompatible" });
    expect(await updateCheck(db, device({ currentReleaseId: ids["r1"]! }))).toMatchObject({ reason: "up_to_date" });
    expect(await updateCheck(db, device({ platform: "ios" }))).toMatchObject({ reason: "no_release" });

    const strict = await readyRelease("a", "main", 2, { native: ">=2.0.0", channel: "staging" });
    await publishRelease(owner, { releaseId: strict, rolloutPercentage: 100 });
    expect(await updateCheck(db, device({ channelName: "staging" }))).toMatchObject({ reason: "native_incompatible" });
    expect((await updateCheck(db, device({ channelName: "staging", nativeVersion: "2.1.0" }))).updateAvailable).toBe(true);
  });

  it("keeps Android and iOS targets independent on one channel", async () => {
    ids["ios1"] = await readyRelease("a", "main", 3, { platform: "ios" });
    await publishRelease(owner, { releaseId: ids["ios1"], rolloutPercentage: 100 });
    expect((await updateCheck(db, device({ platform: "ios" }))).release?.id).toBe(ids["ios1"]);
    expect((await updateCheck(db, device())).release?.id).toBe(ids["r1"]);
  });

  it("resolves apps safely by id or unambiguous slug", async () => {
    await expectCode(updateCheck(db, device({ appKey: `${run}-shared` })), "INVALID_INPUT");
    await expectCode(updateCheck(db, device({ appKey: "x),id.eq.1" })), "RESOURCE_NOT_FOUND");
    await expectCode(updateCheck(db, device({ appKey: crypto.randomUUID() })), "RESOURCE_NOT_FOUND");
    await expectCode(updateCheck(db, device({ channelName: "does-not-exist" })), "INVALID_CHANNEL");
  });

  it("enforces role permissions server-side", async () => {
    const viewer = await orgContextForUser(users["viewer"]!);
    const developer = await orgContextForUser(users["developer"]!);
    const manager = await orgContextForUser(users["manager"]!);
    const r = await readyRelease("a", "main", 4);
    await expectCode(publishRelease(viewer, { releaseId: r, rolloutPercentage: 100 }), "AUTHORIZATION_ERROR");
    await expectCode(publishRelease(developer, { releaseId: r, rolloutPercentage: 100 }), "AUTHORIZATION_ERROR");
    await expectCode(pauseRelease(developer, { releaseId: ids["r1"]! }), "AUTHORIZATION_ERROR");
    await expectCode(deleteRelease(manager, { releaseId: r }), "AUTHORIZATION_ERROR");
    await expectCode(
      createRelease(viewer, { appId: ids["app_main"]!, channelName: "production", platform: "android", version: "3.0.0", runtimeVersion: "1.4.0" }),
      "AUTHORIZATION_ERROR",
    );
    ids["r4"] = r;
  });

  it("isolates organizations", async () => {
    await expectCode(publishRelease(other, { releaseId: ids["r4"]!, rolloutPercentage: 100 }), "RESOURCE_NOT_FOUND");
    await expectCode(pauseRelease(other, { releaseId: ids["r1"]! }), "RESOURCE_NOT_FOUND");
    await expectCode(rollbackRelease(other, { releaseId: ids["r1"]!, reason: "attack" }), "RESOURCE_NOT_FOUND");
    await expectCode(deleteRelease(other, { releaseId: ids["r4"]! }), "RESOURCE_NOT_FOUND");
    await expectCode(
      createRelease(other, { appId: ids["app_main"]!, channelName: "production", platform: "android", version: "5.0.0", runtimeVersion: "1.4.0" }),
      "RESOURCE_NOT_FOUND",
    );
  });

  it("rolls out deterministically", async () => {
    const manager = await orgContextForUser(users["manager"]!);
    await publishRelease(manager, { releaseId: ids["r4"]!, rolloutPercentage: 10 });
    const installs = Array.from({ length: 24 }, (_, i) => `${run}-roll-${String(i).padStart(4, "0")}`);
    for (const installationId of installs) {
      const first = await updateCheck(db, device({ installationId }));
      const again = await updateCheck(db, device({ installationId }));
      const expected = inRollout(installationId, ids["r4"]!, 10);
      expect(first.updateAvailable).toBe(expected);
      expect(again.updateAvailable).toBe(expected);
      if (!expected) expect(first.reason).toBe("not_in_rollout");
    }

    await setRolloutPercentage(manager, { releaseId: ids["r4"]!, percentage: 0 });
    for (const installationId of installs.slice(0, 10)) {
      expect((await updateCheck(db, device({ installationId }))).updateAvailable).toBe(false);
    }
    await setRolloutPercentage(manager, { releaseId: ids["r4"]!, percentage: 100 });
    for (const installationId of installs.slice(0, 10)) {
      expect((await updateCheck(db, device({ installationId }))).release?.id).toBe(ids["r4"]);
    }
    const { data: r1 } = await db.from("releases").select("status").eq("id", ids["r1"]!).single();
    expect(r1?.status).toBe("archived");
  }, 300_000);

  it("stops serving a paused release and resumes it", async () => {
    await pauseRelease(owner, { releaseId: ids["r4"]! });
    expect(await updateCheck(db, device())).toMatchObject({ updateAvailable: false, reason: "no_release" });
    await expectCode(pauseRelease(owner, { releaseId: ids["r4"]! }), "INVALID_STATE_TRANSITION");
    await resumeRelease(owner, { releaseId: ids["r4"]! });
    expect((await updateCheck(db, device())).release?.id).toBe(ids["r4"]);
  });

  it("protects live releases and rollback targets from deletion", async () => {
    await expectCode(deleteRelease(owner, { releaseId: ids["r4"]! }), "RELEASE_DELETE_NOT_ALLOWED");
    await expectCode(deleteRelease(owner, { releaseId: ids["r1"]! }), "RELEASE_DELETE_NOT_ALLOWED");
  });

  it("rolls back to the previous release with a reason and audit trail", async () => {
    await expectCode(rollbackRelease(owner, { releaseId: ids["r4"]!, reason: "" }), "INVALID_INPUT");
    const result = await rollbackRelease(owner, { releaseId: ids["r4"]!, reason: "crash spike in 1.4.4" });
    expect(result.restoredReleaseId).toBe(ids["r1"]);
    expect((await updateCheck(db, device())).release?.id).toBe(ids["r1"]);
    await expectCode(rollbackRelease(owner, { releaseId: ids["r4"]!, reason: "again" }), "ROLLBACK_NOT_ALLOWED");

    const { data: deployment } = await db
      .from("deployments")
      .select("type, release_id, previous_release_id, reason")
      .eq("organization_id", orgs["a"]!)
      .eq("type", "rollback")
      .single();
    expect(deployment).toMatchObject({ release_id: ids["r1"], previous_release_id: ids["r4"], reason: "crash spike in 1.4.4" });

    const { data: audits } = await db.from("audit_logs").select("action, actor_label").eq("organization_id", orgs["a"]!);
    const actions = new Set((audits ?? []).map((a) => a.action));
    for (const action of ["release.created", "release.published", "rollout.updated", "release.paused", "release.rolled_back"]) {
      expect(actions.has(action), action).toBe(true);
    }
  });

  it("refuses rollback targets that are deleted, foreign or runtime-incompatible", async () => {
    const otherRuntime = await readyRelease("a", "main", 5, { runtime: "2.0.0" });
    await expectCode(rollbackRelease(owner, { releaseId: ids["r1"]!, reason: "test", targetReleaseId: otherRuntime }), "INCOMPATIBLE_RUNTIME");
    const foreign = await readyRelease("b", "foreign", 1);
    await expectCode(rollbackRelease(owner, { releaseId: ids["r1"]!, reason: "test", targetReleaseId: foreign }), "ROLLBACK_NOT_ALLOWED");
    await db.from("releases").update({ status: "deleted" }).eq("id", otherRuntime);
    await expectCode(rollbackRelease(owner, { releaseId: ids["r1"]!, reason: "test", targetReleaseId: otherRuntime }), "ROLLBACK_NOT_ALLOWED");
    expect((await updateCheck(db, device())).release?.id).toBe(ids["r1"]);
  });

  it("deletes a release even when Firebase cleanup fails and reports the bundle as kept", async () => {
    await archiveRelease(owner, { releaseId: ids["r4"]! });
    const result = await deleteRelease(owner, { releaseId: ids["r4"]! });
    expect(result).toMatchObject({ deleted: true, bundleKept: true });
    const { data } = await db.from("releases").select("id").eq("id", ids["r4"]!).maybeSingle();
    expect(data).toBeNull();
    const { data: rollouts } = await db.from("rollouts").select("id").eq("release_id", ids["r4"]!);
    expect(rollouts ?? []).toHaveLength(0);
  });

  it("keeps exactly one active release per channel and platform under concurrent publishes", async () => {
    const candidates = await Promise.all([6, 7, 8].map((n) => readyRelease("a", "main", n)));
    const outcomes = await Promise.allSettled(candidates.map((releaseId) => publishRelease(owner, { releaseId, rolloutPercentage: 100 })));
    expect(outcomes.some((o) => o.status === "fulfilled")).toBe(true);

    const { data: target } = await db
      .from("channel_targets")
      .select("release_id")
      .eq("channel_id", ids["ch_main_production"]!)
      .eq("platform", "android")
      .single();
    const { data: live } = await db
      .from("releases")
      .select("id")
      .eq("channel_id", ids["ch_main_production"]!)
      .eq("platform", "android")
      .eq("status", "published");
    expect(live).toHaveLength(1);
    expect(live?.[0]?.id).toBe(target?.release_id);
  });

  it("authenticates API keys and enforces scope, revocation and expiry", async () => {
    const make = async (scopes: string[], extra: Record<string, unknown> = {}) => {
      const key = generateApiKey("production");
      await db.from("api_keys").insert({
        organization_id: orgs["a"],
        name: `${run} key`,
        prefix: key.prefix,
        token_hash: key.hash,
        scopes,
        status: "active",
        ...extra,
      });
      return key.token;
    };
    const req = (token: string) => new Request("https://fireota.test/api", { headers: { authorization: `Bearer ${token}` } });

    const good = await make(["release.read", "release.write"]);
    const ctx = await contextFromApiKey(req(good), "release.write");
    expect(ctx.organizationId).toBe(orgs["a"]);
    expect(ctx.role).toBe("developer");
    await expectCode(contextFromApiKey(req(good), "release.publish"), "AUTHORIZATION_ERROR");
    await expectCode(contextFromApiKey(req(await make(["release.read"], { status: "revoked" }))), "API_KEY_REVOKED");
    await expectCode(
      contextFromApiKey(req(await make(["release.read"], { expires_at: new Date(Date.now() - 60_000).toISOString() }))),
      "API_KEY_EXPIRED",
    );
    await expectCode(contextFromApiKey(req("fota_sk_live_forged")), "API_KEY_INVALID");
    await expectCode(contextFromApiKey(new Request("https://fireota.test/api")), "AUTHENTICATION_ERROR");
    // A developer-scoped key still cannot publish through the engine.
    await expectCode(publishRelease(ctx, { releaseId: ids["r1"]!, rolloutPercentage: 100 }), "AUTHORIZATION_ERROR");
  });

  it("stores analytics once per event id and auto-pauses on real failure rates", async () => {
    const releaseId = await readyRelease("a", "main", 9, { channel: "staging", native: "*" });
    await publishRelease(owner, { releaseId, rolloutPercentage: 100 });
    const base = {
      organizationId: orgs["a"]!,
      appId: ids["app_main"]!,
      channelId: ids["ch_main_staging"]!,
      releaseId,
    };
    const input = (i: number) => ({ platform: "android" as const, installationId: `${run}-fleet-${i}`, runtimeVersion: "1.4.0" });

    expect(await recordEvent(db, { ...base, eventType: "install_failed", input: input(0), eventId: `${run}-evt-0` })).toBe(true);
    expect(await recordEvent(db, { ...base, eventType: "install_failed", input: input(0), eventId: `${run}-evt-0` })).toBe(false);

    // One device flooding failures must not pause the release.
    for (let i = 0; i < 30; i += 1) await recordEvent(db, { ...base, eventType: "install_failed", input: input(0) });
    await evaluateRollbackThreshold(db, releaseId);
    expect((await db.from("releases").select("status").eq("id", releaseId).single()).data?.status).toBe("published");

    // 25 distinct devices with a 20% failure rate does.
    for (let i = 1; i <= 25; i += 1) {
      await recordEvent(db, { ...base, eventType: i <= 20 ? "install_succeeded" : "install_failed", input: input(i) });
    }
    await evaluateRollbackThreshold(db, releaseId);
    expect((await db.from("releases").select("status").eq("id", releaseId).single()).data?.status).toBe("paused");
  });

  it("dead-letters webhooks aimed at private networks without contacting them", async () => {
    const { data: hook } = await db
      .from("webhooks")
      .insert({ organization_id: orgs["a"], endpoint: "https://169.254.169.254/latest", events: ["release.published"], secret: "s", status: "active" })
      .select("id")
      .single();
    await dispatchWebhooks(db, orgs["a"]!, "release.published", { test: true });
    const { data: deliveries } = await db.from("webhook_deliveries").select("succeeded, dead, error, status_code").eq("webhook_id", hook!.id);
    expect(deliveries).toHaveLength(1);
    expect(deliveries?.[0]).toMatchObject({ succeeded: false, dead: true, status_code: 0 });
  });

  it("row level security hides other tenants and blocks direct writes", async () => {
    const signedIn = async (user: string) => {
      const client = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error } = await client.auth.signInWithPassword({ email: `${run}-${user}@fireota.test`, password });
      if (error) throw error;
      return client;
    };
    const a = await signedIn("viewer");
    const b = await signedIn("other");

    const mine = await a.from("releases").select("id").eq("organization_id", orgs["a"]!);
    expect((mine.data ?? []).length).toBeGreaterThan(0);
    const theirs = await b.from("releases").select("id").eq("organization_id", orgs["a"]!);
    expect(theirs.data ?? []).toHaveLength(0);
    expect((await b.from("audit_logs").select("id").eq("organization_id", orgs["a"]!)).data ?? []).toHaveLength(0);
    expect((await b.from("channel_targets").select("release_id").eq("organization_id", orgs["a"]!)).data ?? []).toHaveLength(0);

    // Server-only tables are invisible even to members.
    expect((await a.from("api_keys").select("id")).data ?? []).toHaveLength(0);
    expect((await a.from("webhooks").select("id")).data ?? []).toHaveLength(0);

    // Clients can never change release state, write audit entries or call the lifecycle functions.
    await a.from("releases").update({ status: "published" }).eq("id", ids["draft"]!);
    expect((await db.from("releases").select("status").eq("id", ids["draft"]!).single()).data?.status).toBe("draft");
    expect((await a.from("audit_logs").insert({ organization_id: orgs["a"], action: "x", resource_type: "x" })).error).not.toBeNull();
    expect((await a.from("organization_members").update({ role: "owner" }).eq("user_id", users["viewer"]!).select()).data ?? []).toHaveLength(0);
    const rpc = await a.rpc("fireota_publish_release", {
      _org: orgs["a"],
      _release_id: ids["draft"],
      _percentage: 100,
      _actor: users["viewer"],
      _actor_label: "x",
      _source: "x",
    });
    expect(rpc.error).not.toBeNull();
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.from("releases").select("id")).data ?? []).toHaveLength(0);
  });
});
