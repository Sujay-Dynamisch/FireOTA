/**
 * Firebase / Google adapters. All Google traffic goes through here so it is
 * testable, replaceable, and SSRF-safe (host allow-list, no user supplied URLs).
 */
import { ApiError, fail } from "./errors";
import { decryptSecret, encryptSecret } from "./crypto.server";

const ALLOWED_HOSTS = new Set([
  "oauth2.googleapis.com",
  "accounts.google.com",
  "firebase.googleapis.com",
  "firebasestorage.googleapis.com",
  "firestore.googleapis.com",
  "storage.googleapis.com",
  "www.googleapis.com",
]);

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/firebase",
];

function guard(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    fail("FIREBASE_CONNECTION_ERROR", "Blocked an outbound request to a non-Google host.");
  }
  return parsed;
}

async function googleFetch(url: string, init: RequestInit & { accessToken?: string } = {}) {
  guard(url);
  const headers = new Headers(init.headers);
  if (init.accessToken) headers.set("Authorization", `Bearer ${init.accessToken}`);
  const response = await fetch(url, { ...init, headers, redirect: "error" });
  if (response.status === 401) fail("FIREBASE_AUTH_EXPIRED", "The Google authorization for this project expired.");
  if (response.status === 403) fail("FIREBASE_PERMISSION_ERROR", "The connected Google account is missing permissions.");
  if (response.status === 404) fail("FIREBASE_PROJECT_NOT_FOUND", "The Firebase resource was not found.");
  if (!response.ok) {
    // Provider text stays in logs, never in the API response.
    console.error(JSON.stringify({ level: "error", google: url, status: response.status }));
    fail("FIREBASE_CONNECTION_ERROR", "Firebase rejected the request.");
  }
  return response;
}

function clientCredentials() {
  const id = process.env["GOOGLE_CLIENT_ID"]?.trim();
  const secret = process.env["GOOGLE_CLIENT_SECRET"]?.trim();
  if (!id || !secret) fail("FIREBASE_CONNECTION_ERROR", "Google OAuth is not configured on this deployment.");
  return { id: id as string, secret: secret as string };
}

export function redirectUri(origin: string) {
  const fallback = `${origin}/api/public/v1/firebase/callback`;
  // Trim: a stray space pasted into the env var is sent verbatim and Google blocks it as insecure.
  const configured = process.env["GOOGLE_REDIRECT_URI"]?.trim();
  // A redirect for another host (e.g. a localhost value copied into production) would send Google
  // back to the wrong site and is rejected for published OAuth apps; use this site's callback instead.
  if (!configured) return fallback;
  try {
    const parsed = new URL(configured);
    return parsed.origin === origin ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

export function authorizationUrl(input: { state: string; challenge: string; origin: string }) {
  const { id } = clientCredentials();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(input.origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(input: { code: string; verifier: string; origin: string }) {
  const { id, secret } = clientCredentials();
  const response = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      code: input.code,
      code_verifier: input.verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(input.origin),
    }),
  });
  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };
  return {
    accessToken: json.access_token,
    refreshTokenCiphertext: json.refresh_token ? encryptSecret(json.refresh_token) : null,
    email: json.id_token ? emailFromIdToken(json.id_token) : "",
  };
}

function emailFromIdToken(idToken: string): string {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return "";
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string };
    return decoded.email ?? "";
  } catch {
    return "";
  }
}

/** Exchanges the stored (encrypted) refresh token for a short-lived access token. */
export async function accessTokenFromConnection(refreshTokenCiphertext: string | null): Promise<string> {
  if (!refreshTokenCiphertext) fail("FIREBASE_AUTH_EXPIRED", "This Firebase connection needs to be re-authorized.");
  const { id, secret } = clientCredentials();
  const response = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: decryptSecret(refreshTokenCiphertext),
      grant_type: "refresh_token",
    }),
  });
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) fail("FIREBASE_AUTH_EXPIRED", "Google did not return an access token.");
  return json.access_token as string;
}

export interface DiscoveredProject {
  projectId: string;
  projectNumber: string;
  displayName: string;
  storageBucket: string | null;
}

export async function listProjects(accessToken: string): Promise<DiscoveredProject[]> {
  const response = await googleFetch("https://firebase.googleapis.com/v1beta1/projects?pageSize=100", { accessToken });
  const json = (await response.json()) as {
    results?: {
      projectId: string;
      projectNumber: string;
      displayName: string;
      resources?: { storageBucket?: string };
    }[];
  };
  return (json.results ?? []).map((p) => ({
    projectId: p.projectId,
    projectNumber: p.projectNumber,
    displayName: p.displayName || p.projectId,
    storageBucket: p.resources?.storageBucket ?? null,
  }));
}

/**
 * Finds the project's default Firebase Storage bucket. Buckets created since late 2024
 * (<project>.firebasestorage.app) are not reported in the project's `resources`, so ask
 * Firebase Storage for the buckets linked to the project.
 */
export async function discoverStorageBucket(accessToken: string, projectId: string): Promise<string | null> {
  try {
    const res = await googleFetch(
      `https://firebasestorage.googleapis.com/v1beta/projects/${encodeURIComponent(projectId)}/buckets`,
      { accessToken },
    );
    const json = (await res.json()) as { buckets?: { name: string }[] };
    const names = (json.buckets ?? []).map((b) => b.name.split("/buckets/")[1] ?? "").filter(Boolean);
    return (
      names.find((n) => n === `${projectId}.firebasestorage.app`) ??
      names.find((n) => n === `${projectId}.appspot.com`) ??
      names[0] ??
      null
    );
  } catch {
    return null;
  }
}

/** Proves write + delete access with a tiny object under the FireOTA prefix. */
async function canWriteStorage(accessToken: string, bucket: string) {
  try {
    const probe = await uploadArtifact({
      accessToken,
      bucket,
      path: "fireota/.healthcheck",
      body: new TextEncoder().encode(new Date().toISOString()),
      contentType: "text/plain",
    });
    await deleteArtifact({ accessToken, bucket, path: probe.path });
    return true;
  } catch {
    return false;
  }
}

export async function projectHealth(accessToken: string, projectId: string) {
  const detail = await googleFetch(`https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}`, {
    accessToken,
  });
  const project = (await detail.json()) as {
    projectNumber: string;
    displayName: string;
    resources?: { storageBucket?: string };
  };
  const storageBucket = project.resources?.storageBucket ?? (await discoverStorageBucket(accessToken, projectId));
  const storage = storageBucket ? await canWriteStorage(accessToken, storageBucket) : false;

  let firestore = false;
  try {
    const res = await googleFetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases`,
      { accessToken },
    );
    const dbs = (await res.json()) as { databases?: unknown[] };
    firestore = (dbs.databases?.length ?? 0) > 0;
  } catch {
    firestore = false;
  }

  const permissions = [
    { label: "Firebase project read", granted: true },
    { label: "Cloud Storage read/write", granted: storage },
    { label: "Firestore access", granted: firestore, optional: true },
  ];

  return {
    projectNumber: project.projectNumber,
    displayName: project.displayName || projectId,
    storageBucket,
    storage,
    firestore,
    permissions,
    status: storage ? ("connected" as const) : ("permission_error" as const),
  };
}

/** Uploads an artifact into the customer's own Cloud Storage bucket. */
export async function uploadArtifact(input: {
  accessToken: string;
  bucket: string;
  path: string;
  body: Uint8Array;
  contentType: string;
}) {
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(input.bucket)}/o?uploadType=media&name=${encodeURIComponent(input.path)}`;
  const response = await googleFetch(url, {
    method: "POST",
    accessToken: input.accessToken,
    headers: { "content-type": input.contentType },
    body: input.body as unknown as BodyInit,
  });
  const json = (await response.json()) as { downloadTokens?: string; size?: string; name?: string };
  if (!json.name) fail("STORAGE_ERROR", "Firebase Storage did not confirm the upload.");
  return {
    path: json.name as string,
    size: Number(json.size ?? input.body.byteLength),
    downloadToken: json.downloadTokens ?? null,
  };
}

export function artifactDownloadUrl(bucket: string, path: string, downloadToken: string | null) {
  const base = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?alt=media`;
  return downloadToken ? `${base}&token=${downloadToken}` : base;
}

export async function verifyArtifact(input: { accessToken: string; bucket: string; path: string }) {
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(input.bucket)}/o/${encodeURIComponent(input.path)}`;
  const response = await googleFetch(url, { accessToken: input.accessToken });
  const json = (await response.json()) as { size?: string; md5Hash?: string };
  return { exists: true, size: Number(json.size ?? 0) };
}

export async function deleteArtifact(input: { accessToken: string; bucket: string; path: string }) {
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(input.bucket)}/o/${encodeURIComponent(input.path)}`;
  try {
    await googleFetch(url, { method: "DELETE", accessToken: input.accessToken });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === "FIREBASE_PROJECT_NOT_FOUND") return true;
    throw error;
  }
}

export async function listArtifacts(input: { accessToken: string; bucket: string; prefix: string }) {
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(input.bucket)}/o?prefix=${encodeURIComponent(input.prefix)}`;
  const response = await googleFetch(url, { accessToken: input.accessToken });
  const json = (await response.json()) as { items?: { name: string; size?: string }[] };
  return (json.items ?? []).map((i) => ({ path: i.name, size: Number(i.size ?? 0) }));
}
