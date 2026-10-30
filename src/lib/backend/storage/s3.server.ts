/**
 * S3-Compatible Storage Provider (AWS S3, Cloudflare R2, MinIO, Wasabi, DigitalOcean Spaces).
 * Fully zero-proxy and sovereign: files are stored directly in the customer's cloud bucket.
 */
import { ApiError, fail } from "../errors";
import { presignUrl, signRequest } from "./sigv4";
import type {
  S3Credentials,
  StorageFailureReason,
  StorageProvider,
  StorageProviderType,
  StorageUploadInput,
  StorageUploadResult,
  StorageVerificationResult,
} from "./types";

export class S3StorageProvider implements StorageProvider {
  readonly id: string;
  readonly name: string;
  readonly provider: StorageProviderType;
  readonly bucket: string;
  readonly region: string;
  readonly endpoint: string;
  readonly credentials: S3Credentials;
  readonly publicCdnUrl?: string;

  constructor(input: {
    id: string;
    name: string;
    bucket: string;
    provider?: StorageProviderType;
    credentials: S3Credentials;
    endpoint?: string;
    region?: string;
    publicCdnUrl?: string;
  }) {
    this.id = input.id;
    this.name = input.name;
    this.bucket = input.bucket.trim();
    this.provider = input.provider ?? "s3";
    this.credentials = input.credentials;
    this.publicCdnUrl = input.publicCdnUrl?.trim() || input.credentials.publicCdnUrl?.trim();
    this.region = input.region?.trim() || input.credentials.region?.trim() || (this.provider === "r2" ? "auto" : "us-east-1");

    // Endpoint resolution:
    const rawEndpoint = input.endpoint?.trim() || input.credentials.endpoint?.trim();
    if (rawEndpoint) {
      this.endpoint = rawEndpoint.replace(/\/$/, "");
    } else if (this.provider === "r2") {
      fail("STORAGE_ERROR", "Cloudflare R2 requires an endpoint or Account ID.");
    } else {
      this.endpoint = `https://s3.${this.region}.amazonaws.com`;
    }
  }

  /** Constructs the full object URL */
  protected objectUrl(path: string): string {
    const cleanPath = path.replace(/^\//, "");
    const base = new URL(this.endpoint);

    // If endpoint already contains the bucket, or virtual-hosted is configured
    if (base.hostname.startsWith(`${this.bucket}.`)) {
      return `${this.endpoint}/${cleanPath}`;
    }

    // Path-style is standard and safest across R2, MinIO, Wasabi, and custom endpoints
    return `${this.endpoint}/${encodeURIComponent(this.bucket)}/${cleanPath}`;
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const targetUrl = this.objectUrl(input.path);
    const contentType = input.contentType || "application/octet-stream";

    const { url, headers } = signRequest({
      method: "PUT",
      url: targetUrl,
      body: input.body,
      headers: { "content-type": contentType },
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
      region: this.region,
    });

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: input.body as unknown as BodyInit,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 403) fail("STORAGE_PERMISSION_ERROR", "Access denied when writing to S3 bucket.");
        if (response.status === 404) fail("STORAGE_ERROR", "The target S3 bucket does not exist.");
        fail("STORAGE_ERROR", `S3 upload failed (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const downloadUrl = await this.getDownloadUrl(input.path);
      return {
        path: input.path,
        size: input.body.byteLength,
        downloadUrl,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const message = error instanceof Error ? error.message : "S3 network error";
      fail("STORAGE_CONNECTION_ERROR", `Could not connect to S3 storage endpoint: ${message}`);
    }
  }

  async getDownloadUrl(path: string, options: { expiresInSeconds?: number } = {}): Promise<string> {
    const cleanPath = path.replace(/^\//, "");
    if (this.publicCdnUrl) {
      const cdnBase = this.publicCdnUrl.replace(/\/$/, "");
      return `${cdnBase}/${cleanPath}`;
    }

    const targetUrl = this.objectUrl(cleanPath);
    return presignUrl({
      method: "GET",
      url: targetUrl,
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
      region: this.region,
      expiresInSeconds: options.expiresInSeconds ?? 3600 * 24, // 24 hours default
    });
  }

  async verify(): Promise<StorageVerificationResult> {
    const probePath = `fireota/.healthcheck-${Date.now()}`;
    const probePayload = new TextEncoder().encode(`fireota-healthcheck-${new Date().toISOString()}`);

    try {
      // Step 1: Prove write access
      await this.upload({
        path: probePath,
        body: probePayload,
        contentType: "text/plain",
      });

      // Step 2: Prove read access
      const probeUrl = this.objectUrl(probePath);
      const { url, headers } = signRequest({
        method: "GET",
        url: probeUrl,
        accessKeyId: this.credentials.accessKeyId,
        secretAccessKey: this.credentials.secretAccessKey,
        region: this.region,
      });

      const getRes = await fetch(url, { method: "GET", headers });
      if (!getRes.ok) {
        await this.delete(probePath).catch(() => {});
        return {
          ok: false,
          reason: "permission",
          message: "Write succeeded but reading the probe file back was refused.",
        };
      }

      // Step 3: Prove delete access
      await this.delete(probePath);

      return {
        ok: true,
        details: {
          bucketExists: true,
          writePermitted: true,
          readPermitted: true,
          deletePermitted: true,
        },
      };
    } catch (error) {
      let reason: StorageFailureReason = "unknown";
      const message = error instanceof Error ? error.message : "Verification probe failed";

      if (error instanceof ApiError) {
        if (error.code === "STORAGE_PERMISSION_ERROR") reason = "permission";
        else if (error.code === "STORAGE_CONNECTION_ERROR") reason = "endpoint_unreachable";
        else if (/does not exist/i.test(error.message)) reason = "bucket_missing";
      } else if (/ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(message)) {
        reason = "endpoint_unreachable";
      } else if (/403|Forbidden|AccessDenied|SignatureDoesNotMatch/i.test(message)) {
        reason = "permission";
      } else if (/404|NoSuchBucket|NotFound/i.test(message)) {
        reason = "bucket_missing";
      }

      return { ok: false, reason, message };
    }
  }

  async delete(path: string): Promise<boolean> {
    const cleanPath = path.replace(/^\//, "");
    const targetUrl = this.objectUrl(cleanPath);

    const { url, headers } = signRequest({
      method: "DELETE",
      url: targetUrl,
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
      region: this.region,
    });

    try {
      const response = await fetch(url, { method: "DELETE", headers });
      return response.status >= 200 && response.status < 300 || response.status === 404;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<{ path: string; size: number }[]> {
    const cleanPrefix = prefix.replace(/^\//, "");
    const base = new URL(this.endpoint);
    let listUrl: string;

    if (base.hostname.startsWith(`${this.bucket}.`)) {
      listUrl = `${this.endpoint}?list-type=2&prefix=${encodeURIComponent(cleanPrefix)}`;
    } else {
      listUrl = `${this.endpoint}/${encodeURIComponent(this.bucket)}?list-type=2&prefix=${encodeURIComponent(cleanPrefix)}`;
    }

    const { url, headers } = signRequest({
      method: "GET",
      url: listUrl,
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
      region: this.region,
    });

    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) return [];

    const xml = await response.text();
    const items: { path: string; size: number }[] = [];
    const keyRegex = /<Key>(.*?)<\/Key>/g;
    const sizeRegex = /<Size>(\d+)<\/Size>/g;

    let keyMatch: RegExpExecArray | null;
    while ((keyMatch = keyRegex.exec(xml)) !== null) {
      const sizeMatch = sizeRegex.exec(xml);
      items.push({
        path: keyMatch[1] ?? "",
        size: Number(sizeMatch?.[1] ?? 0),
      });
    }

    return items;
  }
}

