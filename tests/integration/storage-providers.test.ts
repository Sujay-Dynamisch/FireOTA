/**
 * Storage Providers & SigV4 Test Suite.
 * Exercises the multi-cloud sovereign storage layer: AWS S3, Cloudflare R2, MinIO, GCS, Azure, and BYOU.
 */
import { describe, expect, it } from "vitest";

import { presignUrl, signRequest } from "@/lib/backend/storage/sigv4";
import { S3StorageProvider } from "@/lib/backend/storage/s3.server";
import { GCSStorageProvider } from "@/lib/backend/storage/gcs.server";
import { AzureBlobStorageProvider } from "@/lib/backend/storage/azure.server";
import { ExternalUrlStorageProvider } from "@/lib/backend/storage/external.server";
import { buildProviderFromRow } from "@/lib/backend/storage/factory.server";
import { encryptSecret, decryptSecret } from "@/lib/backend/crypto.server";

describe("AWS SigV4 Presigner & Request Signer", () => {
  const credentials = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
  };

  it("generates deterministic presigned download URLs with SigV4", () => {
    const fixedNow = new Date("2026-10-30T12:00:00Z");
    const url = presignUrl({
      url: "https://mybucket.s3.us-east-1.amazonaws.com/releases/r1/bundle.hbc",
      method: "GET",
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: credentials.region,
      expiresInSeconds: 3600,
      now: fixedNow,
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Credential")).toBe("AKIAIOSFODNN7EXAMPLE/20261030/us-east-1/s3/aws4_request");
    expect(parsed.searchParams.get("X-Amz-Date")).toBe("20261030T120000Z");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBeDefined();
    expect(parsed.searchParams.get("X-Amz-Signature")?.length).toBe(64);
  });

  it("signs PUT requests with proper Authorization headers", () => {
    const fixedNow = new Date("2026-10-30T12:00:00Z");
    const payload = new TextEncoder().encode("test payload");
    const { headers } = signRequest({
      url: "https://mybucket.s3.us-east-1.amazonaws.com/releases/r1/bundle.hbc",
      method: "PUT",
      body: payload,
      headers: { "content-type": "application/octet-stream" },
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: credentials.region,
      now: fixedNow,
    });

    expect(headers["authorization"]).toContain("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261030/us-east-1/s3/aws4_request");
    expect(headers["x-amz-date"]).toBe("20261030T120000Z");
    expect(headers["x-amz-content-sha256"]).toBeDefined();
  });
});

describe("S3StorageProvider (Cloudflare R2, AWS S3, MinIO)", () => {
  it("initializes Cloudflare R2 with custom endpoint and formats presigned URLs", async () => {
    const provider = new S3StorageProvider({
      id: "tgt-r2-1",
      name: "Production R2",
      provider: "r2",
      bucket: "my-r2-bucket",
      endpoint: "https://abc123456789.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "r2-access-key",
        secretAccessKey: "r2-secret-key",
      },
    });

    expect(provider.provider).toBe("r2");
    expect(provider.region).toBe("auto");

    const downloadUrl = await provider.getDownloadUrl("releases/bundle.hbc");
    expect(downloadUrl).toContain("https://abc123456789.r2.cloudflarestorage.com/my-r2-bucket/releases/bundle.hbc");
    expect(downloadUrl).toContain("X-Amz-Signature=");
  });

  it("uses public CDN domain when configured instead of presigned S3 URLs", async () => {
    const provider = new S3StorageProvider({
      id: "tgt-s3-cdn",
      name: "AWS S3 with CloudFront",
      provider: "s3",
      bucket: "my-app-updates",
      region: "us-east-1",
      publicCdnUrl: "https://cdn.mycompany.com",
      credentials: {
        accessKeyId: "aws-key",
        secretAccessKey: "aws-secret",
      },
    });

    const downloadUrl = await provider.getDownloadUrl("releases/r10/bundle.hbc");
    expect(downloadUrl).toBe("https://cdn.mycompany.com/releases/r10/bundle.hbc");
  });

  it("handles MinIO self-hosted endpoint with custom port", async () => {
    const provider = new S3StorageProvider({
      id: "tgt-minio-1",
      name: "Local MinIO",
      provider: "minio",
      bucket: "ota-bundles",
      endpoint: "http://192.168.1.50:9000",
      credentials: {
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
      },
    });

    const downloadUrl = await provider.getDownloadUrl("apps/app1/bundle.hbc");
    expect(downloadUrl).toContain("http://192.168.1.50:9000/ota-bundles/apps/app1/bundle.hbc");
  });
});

describe("GCSStorageProvider & AzureBlobStorageProvider", () => {
  it("formats Google Cloud Storage download URLs", async () => {
    const provider = new GCSStorageProvider({
      id: "tgt-gcs-1",
      name: "Google Cloud Bucket",
      bucket: "my-gcs-bucket",
      credentials: {
        clientEmail: "fireota@my-project.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----",
      },
    });

    const downloadUrl = await provider.getDownloadUrl("releases/r5/bundle.hbc");
    expect(downloadUrl).toBe("https://storage.googleapis.com/my-gcs-bucket/releases/r5/bundle.hbc");
  });

  it("formats Azure Blob Storage download URLs", async () => {
    const provider = new AzureBlobStorageProvider({
      id: "tgt-azure-1",
      name: "Azure Blob Container",
      bucket: "app-bundles",
      credentials: {
        accountName: "myazurestorage",
        accountKey: Buffer.from("dummy-azure-key").toString("base64"),
      },
    });

    const downloadUrl = await provider.getDownloadUrl("releases/r1/bundle.hbc");
    expect(downloadUrl).toBe("https://myazurestorage.blob.core.windows.net/app-bundles/releases/r1/bundle.hbc");
  });
});

describe("ExternalUrlStorageProvider (Bring Your Own URL)", () => {
  it("returns external URL unmodified for devices", async () => {
    const provider = new ExternalUrlStorageProvider({
      id: "tgt-byou-1",
      name: "Corporate Artifact Server",
    });

    const downloadUrl = await provider.getDownloadUrl("https://artifacts.corp.internal/apps/release-1.2.3.fota");
    expect(downloadUrl).toBe("https://artifacts.corp.internal/apps/release-1.2.3.fota");
  });

  it("prepends base CDN URL when relative paths are supplied", async () => {
    const provider = new ExternalUrlStorageProvider({
      id: "tgt-byou-2",
      name: "CDN Provider",
      publicCdnUrl: "https://updates.example.com",
    });

    const downloadUrl = await provider.getDownloadUrl("android/v1.0.0.fota");
    expect(downloadUrl).toBe("https://updates.example.com/android/v1.0.0.fota");
  });
});

describe("Storage Target Factory & Cryptography", () => {
  it("encrypts and decrypts storage credentials using AES-256-GCM", () => {
    // Set dummy key if not present in env
    process.env["FIREOTA_ENCRYPTION_KEY"] = process.env["FIREOTA_ENCRYPTION_KEY"] || "test-key-material-for-vitest-32bytes";

    const secretPayload = JSON.stringify({
      accessKeyId: "test-access-key",
      secretAccessKey: "super-secret-key-that-must-be-encrypted",
    });

    const encrypted = encryptSecret(secretPayload);
    expect(encrypted).not.toContain("super-secret-key");

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secretPayload);
    const parsed = JSON.parse(decrypted);
    expect(parsed.accessKeyId).toBe("test-access-key");
  });

  it("builds the correct provider instance from a decrypted database row", () => {
    process.env["FIREOTA_ENCRYPTION_KEY"] = process.env["FIREOTA_ENCRYPTION_KEY"] || "test-key-material-for-vitest-32bytes";

    const creds = encryptSecret(
      JSON.stringify({
        accessKeyId: "r2-key",
        secretAccessKey: "r2-secret",
        endpoint: "https://myaccount.r2.cloudflarestorage.com",
      }),
    );

    const provider = buildProviderFromRow({
      id: "target-123",
      name: "My Cloudflare R2",
      provider: "r2",
      bucket: "mobile-releases",
      endpoint: "https://myaccount.r2.cloudflarestorage.com",
      region: "auto",
      public_cdn_url: null,
      config_ciphertext: creds,
    });

    expect(provider.provider).toBe("r2");
    expect(provider.name).toBe("My Cloudflare R2");
    expect(provider.bucket).toBe("mobile-releases");
    expect(provider instanceof S3StorageProvider).toBe(true);
  });
});

