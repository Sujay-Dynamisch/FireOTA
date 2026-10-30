/**
 * Google Cloud Storage (GCS) Provider via Service Account JSON.
 * Eliminates the need for Google OAuth consent screens and billing verification loops.
 */
import { createSign } from "node:crypto";
import { ApiError, fail } from "../errors";
import type {
  GCSCredentials,
  StorageProvider,
  StorageProviderType,
  StorageUploadInput,
  StorageUploadResult,
  StorageVerificationResult,
} from "./types";

interface ParsedServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export class GCSStorageProvider implements StorageProvider {
  readonly id: string;
  readonly name: string;
  readonly provider: StorageProviderType = "gcs";
  readonly bucket: string;
  readonly credentials: GCSCredentials;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(input: {
    id: string;
    name: string;
    bucket: string;
    credentials: GCSCredentials;
  }) {
    this.id = input.id;
    this.name = input.name;
    this.bucket = input.bucket.trim();
    this.credentials = input.credentials;
  }

  private parseCredentials(): ParsedServiceAccount {
    if (this.credentials.serviceAccountJson) {
      try {
        const parsed = JSON.parse(this.credentials.serviceAccountJson) as Record<string, string>;
        return {
          client_email: parsed["client_email"] ?? "",
          private_key: parsed["private_key"] ?? "",
          project_id: parsed["project_id"],
        };
      } catch {
        fail("INVALID_INPUT", "Invalid Service Account JSON format.");
      }
    }

    if (this.credentials.clientEmail && this.credentials.privateKey) {
      return {
        client_email: this.credentials.clientEmail,
        private_key: this.credentials.privateKey,
        project_id: this.credentials.projectId,
      };
    }

    fail("INVALID_INPUT", "GCS requires a Service Account JSON or client_email + private_key.");
  }

  /** Generates a self-signed RS256 JWT and exchanges it for a Google OAuth2 access token */
  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60) {
      return this.cachedToken.token;
    }

    const { client_email, private_key } = this.parseCredentials();
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: client_email,
        scope: "https://www.googleapis.com/auth/devstorage.read_write",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      }),
    ).toString("base64url");

    const toSign = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(toSign);
    signer.end();
    const signature = signer.sign(private_key, "base64url");
    const jwt = `${toSign}.${signature}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      fail("STORAGE_PERMISSION_ERROR", `Failed to authenticate Google Service Account: ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      token: data.access_token,
      expiresAt: now + data.expires_in,
    };
    return data.access_token;
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const token = await this.getAccessToken();
    const cleanPath = input.path.replace(/^\//, "");
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&name=${encodeURIComponent(cleanPath)}`;

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": input.contentType || "application/octet-stream",
      },
      body: input.body as unknown as BodyInit,
    });

    if (!res.ok) {
      if (res.status === 403) fail("STORAGE_PERMISSION_ERROR", "GCS service account lacks Storage Object Creator permissions.");
      if (res.status === 404) fail("STORAGE_ERROR", `GCS bucket '${this.bucket}' not found.`);
      fail("STORAGE_ERROR", `GCS upload failed (${res.status})`);
    }

    const downloadUrl = await this.getDownloadUrl(cleanPath);
    return {
      path: cleanPath,
      size: input.body.byteLength,
      downloadUrl,
    };
  }

  async getDownloadUrl(path: string): Promise<string> {
    const cleanPath = path.replace(/^\//, "");
    // Standard GCS download URL:
    return `https://storage.googleapis.com/${encodeURIComponent(this.bucket)}/${cleanPath}`;
  }

  async verify(): Promise<StorageVerificationResult> {
    const probePath = `fireota/.healthcheck-${Date.now()}`;
    const probePayload = new TextEncoder().encode(`gcs-healthcheck-${new Date().toISOString()}`);

    try {
      await this.upload({ path: probePath, body: probePayload, contentType: "text/plain" });
      await this.delete(probePath);
      return { ok: true, details: { bucketExists: true, writePermitted: true, readPermitted: true, deletePermitted: true } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "GCS verification failed";
      return { ok: false, reason: "permission", message };
    }
  }

  async delete(path: string): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      const cleanPath = path.replace(/^\//, "");
      const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(cleanPath)}`;
      const res = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      return res.status >= 200 && res.status < 300 || res.status === 404;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<{ path: string; size: number }[]> {
    try {
      const token = await this.getAccessToken();
      const listUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o?prefix=${encodeURIComponent(prefix)}`;
      const res = await fetch(listUrl, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const json = (await res.json()) as { items?: { name: string; size: string }[] };
      return (json.items ?? []).map((i) => ({ path: i.name, size: Number(i.size ?? 0) }));
    } catch {
      return [];
    }
  }
}

