/**
 * Dependency-free AWS Signature Version 4 (SigV4) implementation for S3-compatible APIs.
 * Supports AWS S3, Cloudflare R2, MinIO, Wasabi, DigitalOcean Spaces, and Backblaze B2.
 */
import { createHash, createHmac } from "node:crypto";

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSigningKey(secretKey: string, dateStr: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStr);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function uriEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface SigV4Options {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: Uint8Array | string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  now?: Date;
}

/** Signs an HTTP request with AWS4-HMAC-SHA256 in the Authorization header. */
export function signRequest(options: SigV4Options): { url: string; headers: Record<string, string> } {
  const service = options.service ?? "s3";
  const now = options.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStr = amzDate.slice(0, 8); // YYYYMMDD

  const parsedUrl = new URL(options.url);
  const bodyBytes = options.body ? (typeof options.body === "string" ? Buffer.from(options.body) : options.body) : Buffer.alloc(0);
  const payloadHash = sha256Hex(bodyBytes);

  const headers: Record<string, string> = {
    ...options.headers,
    host: parsedUrl.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };

  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v.trim();
  }

  const sortedHeaderKeys = Object.keys(lowerHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${lowerHeaders[k]}\n`).join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  // Canonical query string
  const queryParams = Array.from(parsedUrl.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = queryParams
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join("&");

  // Canonical URI
  const canonicalUri = parsedUrl.pathname
    .split("/")
    .map((seg) => uriEncode(decodeURIComponent(seg)))
    .join("/");

  const canonicalRequest = [
    options.method.toUpperCase(),
    canonicalUri || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStr}/${options.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(options.secretAccessKey, dateStr, options.region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers["authorization"] = authHeader;

  return { url: parsedUrl.toString(), headers };
}

export interface PresignUrlOptions {
  method?: string;
  url: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  expiresInSeconds?: number;
  now?: Date;
}

/** Generates a presigned URL using AWS SigV4 query-string parameters. */
export function presignUrl(options: PresignUrlOptions): string {
  const method = (options.method ?? "GET").toUpperCase();
  const service = options.service ?? "s3";
  const now = options.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStr = amzDate.slice(0, 8);
  const expiresIn = options.expiresInSeconds ?? 3600;

  const parsedUrl = new URL(options.url);
  const credentialScope = `${dateStr}/${options.region}/${service}/aws4_request`;

  parsedUrl.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  parsedUrl.searchParams.set("X-Amz-Credential", `${options.accessKeyId}/${credentialScope}`);
  parsedUrl.searchParams.set("X-Amz-Date", amzDate);
  parsedUrl.searchParams.set("X-Amz-Expires", String(expiresIn));
  parsedUrl.searchParams.set("X-Amz-SignedHeaders", "host");

  const canonicalHeaders = `host:${parsedUrl.host}\n`;
  const signedHeaders = "host";

  const queryParams = Array.from(parsedUrl.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = queryParams
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join("&");

  const canonicalUri = parsedUrl.pathname
    .split("/")
    .map((seg) => uriEncode(decodeURIComponent(seg)))
    .join("/");

  const canonicalRequest = [
    method,
    canonicalUri || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSigningKey(options.secretAccessKey, dateStr, options.region, service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  parsedUrl.searchParams.set("X-Amz-Signature", signature);
  return parsedUrl.toString();
}

