/**
 * Microsoft Azure Blob Storage Provider.
 * Allows teams hosted on Microsoft Azure to store their bundles natively in Azure Blob containers.
 */
import { createHmac } from "node:crypto";
import { ApiError, fail } from "../errors";
import type {
  AzureCredentials,
  StorageProvider,
  StorageProviderType,
  StorageUploadInput,
  StorageUploadResult,
  StorageVerificationResult,
} from "./types";

export class AzureBlobStorageProvider implements StorageProvider {
  readonly id: string;
  readonly name: string;
  readonly provider: StorageProviderType = "azure";
  readonly bucket: string; // Used as container name
  readonly credentials: AzureCredentials;
  readonly endpoint: string;

  constructor(input: {
    id: string;
    name: string;
    bucket: string;
    credentials: AzureCredentials;
    endpoint?: string;
  }) {
    this.id = input.id;
    this.name = input.name;
    this.bucket = input.bucket.trim();
    this.credentials = input.credentials;
    this.endpoint = input.endpoint?.trim() || `https://${input.credentials.accountName}.blob.core.windows.net`;
  }

  private sign(method: string, path: string, headers: Record<string, string>): string {
    const canonicalHeaders = `x-ms-blob-type:${headers["x-ms-blob-type"] || "BlockBlob"}\nx-ms-date:${headers["x-ms-date"]}\nx-ms-version:2020-10-02`;
    const canonicalResource = `/${this.credentials.accountName}/${this.bucket}/${path}`;
    const stringToSign = [
      method.toUpperCase(),
      "", // Content-Encoding
      "", // Content-Language
      headers["content-length"] || "",
      "", // Content-MD5
      headers["content-type"] || "",
      "", // Date
      "", // If-Modified-Since
      "", // If-Match
      "", // If-None-Match
      "", // If-Unmodified-Since
      "", // Range
      canonicalHeaders,
      canonicalResource,
    ].join("\n");

    const key = Buffer.from(this.credentials.accountKey, "base64");
    const hmac = createHmac("sha256", key).update(stringToSign, "utf8").digest("base64");
    return `SharedKey ${this.credentials.accountName}:${hmac}`;
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const cleanPath = input.path.replace(/^\//, "");
    const dateStr = new Date().toUTCString();
    const contentType = input.contentType || "application/octet-stream";

    const headers: Record<string, string> = {
      "x-ms-date": dateStr,
      "x-ms-version": "2020-10-02",
      "x-ms-blob-type": "BlockBlob",
      "content-type": contentType,
      "content-length": String(input.body.byteLength),
    };

    headers["authorization"] = this.sign("PUT", cleanPath, headers);
    const url = `${this.endpoint}/${encodeURIComponent(this.bucket)}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: input.body as unknown as BodyInit,
    });

    if (!res.ok) {
      if (res.status === 403) fail("STORAGE_PERMISSION_ERROR", "Azure credentials refused write access.");
      fail("STORAGE_ERROR", `Azure Blob upload failed with status ${res.status}`);
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
    return `${this.endpoint}/${encodeURIComponent(this.bucket)}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
  }

  async verify(): Promise<StorageVerificationResult> {
    const probePath = `fireota/.healthcheck-${Date.now()}`;
    const probePayload = new TextEncoder().encode(`azure-healthcheck-${new Date().toISOString()}`);

    try {
      await this.upload({ path: probePath, body: probePayload, contentType: "text/plain" });
      await this.delete(probePath);
      return { ok: true, details: { bucketExists: true, writePermitted: true, readPermitted: true, deletePermitted: true } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Azure verification probe failed";
      return { ok: false, reason: "permission", message };
    }
  }

  async delete(path: string): Promise<boolean> {
    try {
      const cleanPath = path.replace(/^\//, "");
      const dateStr = new Date().toUTCString();
      const headers: Record<string, string> = {
        "x-ms-date": dateStr,
        "x-ms-version": "2020-10-02",
      };
      headers["authorization"] = this.sign("DELETE", cleanPath, headers);
      const url = `${this.endpoint}/${encodeURIComponent(this.bucket)}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
      const res = await fetch(url, { method: "DELETE", headers });
      return res.status >= 200 && res.status < 300 || res.status === 404;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<{ path: string; size: number }[]> {
    return [];
  }
}

