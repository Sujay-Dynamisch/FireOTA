/**
 * Dashboard flows over real HTTP, exactly as the browser performs them:
 * Supabase password login -> server functions (/_serverFn/<id>) with the session bearer.
 *
 * Needs a running app: E2E_BASE_URL=http://localhost:8080 npx vitest run tests/e2e
 * Creates a throwaway confirmed user + organization and deletes them afterwards.
 * The Google consent screen itself cannot be automated; the test verifies everything
 * up to it (authorization URL, PKCE, state storage, Google accepting the client and
 * redirect URI) and the callback's rejection paths.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toJSONAsync } from "seroval";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const base = process.env["E2E_BASE_URL"];
const url = process.env["SUPABASE_URL"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

const run = `e2e${Date.now().toString(36)}`;
const email = `${run}@fireota.test`;
const password = `Fx!${crypto.randomUUID()}`;
const admin: SupabaseClient = base ? createClient(url, serviceKey, { auth: { persistSession: false } }) : (null as never);
let userId = "";
let token = "";

function fnId(file: string, name: string) {
  const json = JSON.stringify({ file: `/src/lib/api/${file}.functions.ts?tss-serverfn-split`, export: `${name}_createServerFn_handler` });
  return Buffer.from(json).toString("base64url");
}

type SerovalNode = { t: number; s?: unknown; a?: (SerovalNode | null)[]; p?: { k: string[]; v: SerovalNode[] } };
const CONSTANTS: Record<number, unknown> = { 0: null, 1: undefined, 2: true, 3: false };

/** Minimal reader for the plain-data subset of seroval JSON that server functions return. */
function decode(node: SerovalNode | null): unknown {
  if (!node) return undefined;
  switch (node.t) {
    case 0:
    case 1:
      return node.s;
    case 2:
      return CONSTANTS[node.s as number];
    case 9:
      return (node.a ?? []).map(decode);
    case 10:
    case 11:
      return Object.fromEntries((node.p?.k ?? []).map((k, i) => [k, decode(node.p!.v[i]!)]));
    default:
      return { $unsupported: node.t };
  }
}

/** Calls a server function the way createClientRpc does and returns { ok, value | error }. */
async function call(file: string, name: string, method: "GET" | "POST", data?: unknown, bearer = token) {
  const payload = data === undefined ? undefined : JSON.stringify(await toJSONAsync({ data }));
  let target = `${base}/_serverFn/${fnId(file, name)}`;
  // Same-origin headers, as a browser sends them; cross-site calls are refused with 403.
  const headers: Record<string, string> = {
    "x-tsr-serverFn": "true",
    accept: "application/json",
    origin: base!,
    "sec-fetch-site": "same-origin",
  };
  if (bearer) headers["authorization"] = `Bearer ${bearer}`;
  let body: string | undefined;
  if (method === "GET" && payload) target += `?payload=${encodeURIComponent(payload)}`;
  if (method === "POST" && payload) {
    body = payload;
    headers["content-type"] = "application/json";
  }
  const res = await fetch(target, { method, headers, body: body ?? null, redirect: "manual" });
  const text = await res.text();
  // Serialized envelope: { result, error, context }. Errors use TanStack's "$TSR/Error" node,
  // which plain seroval cannot revive, so read its message straight from the JSON.
  if (text.includes('"$TSR/Error"')) {
    const message = /"message":\{"t":1,"s":"((?:[^"\\]|\\.)*)"/.exec(text)?.[1] ?? "error";
    return { ok: false as const, status: res.status, error: message };
  }
  let envelope: { result?: unknown; error?: unknown } = {};
  try {
    envelope = decode(JSON.parse(text)) as typeof envelope;
  } catch {
    return { ok: false as const, status: res.status, error: text.slice(0, 200) };
  }
  if (envelope.error !== undefined || res.status >= 400) {
    const e = envelope.error;
    return { ok: false as const, status: res.status, error: e instanceof Error ? e.message : JSON.stringify(e) };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper returns whatever each server function sends
  return { ok: true as const, status: res.status, value: envelope.result as any };
}

describe.skipIf(!base)("dashboard flows over HTTP", () => {
  beforeAll(async () => {
    // A browser loads these modules before calling them; the dev server registers their ids then.
    for (const m of ["core", "apps", "firebase"]) await fetch(`${base}/src/lib/api/${m}.functions.ts`);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "E2E Owner" } });
    if (error) throw error;
    userId = data.user.id;
  });

  afterAll(async () => {
    if (!base) return;
    await admin.from("organizations").delete().eq("created_by", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.from("oauth_states").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  describe("login", () => {
    it("rejects a wrong password", async () => {
      const client = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error } = await client.auth.signInWithPassword({ email, password: "wrong-password" });
      expect(error?.message).toMatch(/invalid/i);
    });

    it("signs in with email and password and gets a session", async () => {
      const client = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      expect(error).toBeNull();
      token = data.session!.access_token;
      expect(token.length).toBeGreaterThan(100);
    });

    it("creates the profile automatically for a new user", async () => {
      const { data } = await admin.from("profiles").select("email, name").eq("id", userId).single();
      expect(data).toMatchObject({ email, name: "E2E Owner" });
    });

    it("rejects server calls without or with a forged session", async () => {
      expect((await call("core", "getSession", "GET", undefined, "")).ok).toBe(false);
      expect((await call("core", "getSession", "GET", undefined, "forged.jwt.token")).ok).toBe(false);
    });

    it("reports a signed-in user without an organization (onboarding needed)", async () => {
      const res = await call("core", "getSession", "GET");
      expect(res.ok, res.ok ? "" : res.error).toBe(true);
      expect(JSON.stringify(res.ok && res.value)).toContain(email);
    });

    it("creates the organization during onboarding", async () => {
      const res = await call("core", "createOrganization", "POST", { name: `${run} Workspace`, slug: run });
      expect(res.ok, res.ok ? "" : res.error).toBe(true);
      const session = await call("core", "getSession", "GET");
      expect(JSON.stringify(session.ok && session.value)).toContain(`${run} Workspace`);
      const again = await call("core", "createOrganization", "POST", { name: "Second", slug: `${run}-2` });
      expect(again.ok).toBe(false);
    });
  });

  describe("add app", () => {
    it("rejects an invalid runtime version", async () => {
      const res = await call("apps", "createApp", "POST", {
        name: "Bad runtime",
        runtimeVersion: "latest",
        platforms: [{ platform: "android", packageName: "com.e2e.bad", nativeVersion: "1.0.0" }],
      });
      expect(res.ok).toBe(false);
    });

    it("creates an Android + iOS app with default channels", async () => {
      const res = await call("apps", "createApp", "POST", {
        name: "E2E Ledger",
        runtimeVersion: "1.0.0",
        platforms: [
          { platform: "android", packageName: "com.e2e.ledger", nativeVersion: "1.0.0" },
          { platform: "ios", bundleIdentifier: "com.e2e.ledger", nativeVersion: "1.0.0" },
        ],
      });
      expect(res.ok, res.ok ? "" : res.error).toBe(true);
      const app = res.ok ? (res.value as { id: string; slug: string }) : null;
      expect(app?.slug).toBe("e2e-ledger");

      const list = await call("apps", "listApps", "GET");
      expect(list.ok, list.ok ? "" : list.error).toBe(true);
      expect(JSON.stringify(list.ok && list.value)).toContain("E2E Ledger");

      const { data: channels } = await admin.from("channels").select("name").eq("app_id", app!.id);
      expect((channels ?? []).map((c) => c.name).sort()).toEqual(["beta", "development", "production", "staging"]);
      const { data: platforms } = await admin.from("app_platforms").select("platform").eq("app_id", app!.id);
      expect((platforms ?? []).map((p) => p.platform).sort()).toEqual(["android", "ios"]);
      const { data: audit } = await admin.from("audit_logs").select("action").eq("resource_id", app!.id);
      expect((audit ?? []).map((a) => a.action)).toContain("app.created");
    });

    it("rejects a duplicate app identifier", async () => {
      const res = await call("apps", "createApp", "POST", {
        name: "E2E Ledger",
        runtimeVersion: "1.0.0",
        platforms: [{ platform: "android", packageName: "com.e2e.ledger", nativeVersion: "1.0.0" }],
      });
      expect(res.ok).toBe(false);
    });
  });

  describe("connect Firebase project", () => {
    let authUrl: URL;

    it("refuses to list or connect projects before Google is authorized", async () => {
      expect((await call("firebase", "listSelectableProjects", "GET")).ok).toBe(false);
      expect((await call("firebase", "connectProject", "POST", { firebaseProjectId: "some-project" })).ok).toBe(false);
    });

    it("starts Google OAuth with PKCE and a stored one-time state", async () => {
      const res = await call("firebase", "startFirebaseAuthorization", "POST");
      expect(res.ok, res.ok ? "" : res.error).toBe(true);
      authUrl = new URL((res.ok && (res.value as { url: string }).url) || "");
      expect(authUrl.origin).toBe("https://accounts.google.com");
      const p = authUrl.searchParams;
      expect(p.get("client_id")).toBe(process.env["GOOGLE_CLIENT_ID"]);
      expect(p.get("redirect_uri")).toBe(process.env["GOOGLE_REDIRECT_URI"]);
      expect(p.get("code_challenge_method")).toBe("S256");
      expect(p.get("access_type")).toBe("offline");
      expect(p.get("scope")).toContain("https://www.googleapis.com/auth/firebase");
      const { data: state } = await admin.from("oauth_states").select("user_id").eq("state", p.get("state")!).single();
      expect(state?.user_id).toBe(userId);
    });

    it("is accepted by Google (valid client id and registered redirect URI)", async () => {
      const res = await fetch(authUrl, { redirect: "manual", headers: { "accept-language": "en" } });
      const page = res.status >= 300 && res.status < 400 ? (res.headers.get("location") ?? "") : await res.text();
      expect(page).not.toMatch(/redirect_uri_mismatch|invalid_client|OAuth client was not found|deleted_client|invalid_request/i);
    });

    it("callback rejects unknown, missing and denied states", async () => {
      const callback = `${base}/api/public/v1/firebase/callback`;
      const go = async (query: string) => (await fetch(`${callback}${query}`, { redirect: "manual" })).headers.get("location") ?? "";
      expect(await go("")).toContain("status=invalid");
      expect(await go("?code=x&state=forged")).toContain("status=expired");
      expect(await go("?error=access_denied")).toContain("status=denied");
    });

    it("callback consumes the state once and fails safely on a bad code", async () => {
      const callback = `${base}/api/public/v1/firebase/callback`;
      const state = authUrl.searchParams.get("state")!;
      const first = await fetch(`${callback}?code=not-a-real-code&state=${state}`, { redirect: "manual" });
      expect(first.headers.get("location")).toContain("status=failed");
      const replay = await fetch(`${callback}?code=not-a-real-code&state=${state}`, { redirect: "manual" });
      expect(replay.headers.get("location")).toContain("status=expired");
      const { count } = await admin.from("firebase_connections").select("id", { count: "exact", head: true }).eq("created_by", userId);
      expect(count ?? 0).toBe(0);
    });
  });
});
