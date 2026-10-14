/**
 * Server-only cryptography: credential encryption at rest, artifact checksums,
 * API key hashing and webhook signatures. Never import from browser code.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function encryptionKey(): Buffer {
  const raw = process.env["FIREOTA_ENCRYPTION_KEY"];
  if (!raw) throw new Error("FIREOTA_ENCRYPTION_KEY is not configured");
  // Key material is a random string; derive a stable 32-byte key from it.
  return createHash("sha256").update(raw).digest();
}

/** AES-256-GCM. Output is iv | tag | ciphertext, base64 — one opaque column value. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256")
    .update(data instanceof Buffer ? data : typeof data === "string" ? Buffer.from(data) : Buffer.from(data))
    .digest("hex");
}

/** API keys: a random token shown once; only the hash is stored. */
export function generateApiKey(environment: string) {
  const env = environment === "production" ? "live" : "test";
  const secret = randomBytes(24).toString("base64url");
  const token = `fota_sk_${env}_${secret}`;
  return { token, prefix: token.slice(0, 16), hash: sha256Hex(token) };
}

export function hashApiKey(token: string): string {
  return sha256Hex(token);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** PKCE pair for the Google OAuth authorization code flow. */
export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
