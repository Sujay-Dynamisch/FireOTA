/**
 * Runs the real `fireota` CLI against a running app (E2E_BASE_URL) with a throwaway org + API key.
 * No Firebase project is attached, so uploads stop at the Firebase step by design.
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateApiKey } from "@/lib/backend/crypto.server";
// @ts-expect-error -- plain ESM module without type declarations
import { packDirectory } from "../../packages/cli/lib/package.mjs";

const base = process.env["E2E_BASE_URL"];
const run = `cli${Date.now().toString(36)}`;
const db = base
  ? createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } })
  : (null as never);
const work = mkdtempSync(join(tmpdir(), "fireota-cli-"));
let orgId = "";
let userId = "";
let appId = "";
let token = "";

async function cli(args: string[], key = token) {
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ["packages/cli/bin/fireota.mjs", ...args], {
      env: { ...process.env, FIREOTA_URL: base, FIREOTA_API_KEY: key },
    });
    return { ok: true, out: stdout };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe.skipIf(!base)("fireota CLI", () => {
  beforeAll(async () => {
    const { data: user } = await db.auth.admin.createUser({ email: `${run}@fireota.test`, password: `Fx!${crypto.randomUUID()}`, email_confirm: true });
    userId = user.user!.id;
    const { data: org } = await db.from("organizations").insert({ name: run, slug: run, created_by: userId }).select("id").single();
    orgId = org!.id;
    const { data: app } = await db
      .from("apps")
      .insert({ organization_id: orgId, name: "CLI app", slug: `${run}-app`, status: "active", runtime_version: "1.0.0" })
      .select("id")
      .single();
    appId = app!.id;
    await db.from("app_platforms").insert({ organization_id: orgId, app_id: appId, platform: "android", native_version: "1.0.0", runtime_version: "1.0.0" });
    await db.from("channels").insert({ organization_id: orgId, app_id: appId, name: "production", environment: "production", status: "empty" });
    const key = generateApiKey("production");
    token = key.token;
    await db.from("api_keys").insert({
      organization_id: orgId,
      name: "cli test",
      prefix: key.prefix,
      token_hash: key.hash,
      scopes: ["release.read", "release.write", "release.publish", "rollout.write"],
      status: "active",
    });
  });

  afterAll(async () => {
    if (!base) return;
    await db.from("organizations").delete().eq("id", orgId);
    await db.from("profiles").delete().eq("id", userId);
    await db.auth.admin.deleteUser(userId);
    rmSync(work, { recursive: true, force: true });
  });

  let releaseId = "";

  it("rejects a bad API key with a clear message", async () => {
    const res = await cli(["releases"], "fota_sk_live_forged");
    expect(res.ok).toBe(false);
    expect(res.out).toContain("API_KEY_INVALID");
  });

  it("creates a release idempotently and lists it", async () => {
    const args = ["release", "create", "--app", appId, "--platform", "android", "--version", "1.0.1", "--runtime", "1.0.0"];
    const first = await cli(args);
    expect(first.ok, first.out).toBe(true);
    releaseId = /\(([0-9a-f-]{36})\)/.exec(first.out)?.[1] ?? "";
    expect(releaseId).not.toBe("");
    const second = await cli(args);
    expect(second.out).toContain(releaseId);
    const list = await cli(["releases", "--app", appId]);
    expect(list.out).toContain(releaseId);
    expect(list.out).toContain("draft");
  });

  it("validates input before talking to the server", async () => {
    const res = await cli(["release", "create", "--app", appId, "--platform", "android", "--version", "1.0.2"]);
    expect(res.ok).toBe(false);
    expect(res.out).toContain("--runtime is required");
  });

  it("refuses to upload a plain JS bundle", async () => {
    const file = join(work, "plain.js");
    writeFileSync(file, "console.log('not a package');");
    const res = await cli(["release", "upload", releaseId, "--file", file]);
    expect(res.ok).toBe(false);
    expect(res.out).toContain("fota");
  });

  it("uploads a real package as far as Firebase (none connected here)", async () => {
    const dir = join(work, "pkg");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.android.bundle"), "var a = 1;");
    const file = join(work, "update.fota");
    writeFileSync(file, packDirectory(dir));
    const res = await cli(["release", "upload", releaseId, "--file", file]);
    expect(res.ok).toBe(false);
    expect(res.out).toContain("FIREBASE_CONNECTION_ERROR");
  });

  it("will not publish or change rollout of a release without a verified bundle", async () => {
    const publish = await cli(["release", "publish", releaseId, "--rollout", "10"]);
    expect(publish.out).toContain("RELEASE_NOT_READY");
    const rollout = await cli(["release", "rollout", releaseId, "--percentage", "50"]);
    expect(rollout.out).toContain("INVALID_STATE_TRANSITION");
  });
});
