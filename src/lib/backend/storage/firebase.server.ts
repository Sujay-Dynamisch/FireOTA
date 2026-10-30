/**
 * Firebase / Google Cloud Storage Adapter.
 * Wraps existing Google Cloud OAuth connections behind the unified StorageProvider interface.
 */
import {
  artifactDownloadUrl,
  deleteArtifact,
  listArtifacts,
  uploadArtifact,
} from "../firebase.server";
import type {
  StorageProvider,
  StorageProviderType,
  StorageUploadInput,
  StorageUploadResult,
  StorageVerificationResult,
} from "./types";

export class FirebaseStorageProvider implements StorageProvider {
  readonly id: string;
  readonly name: string;
  readonly provider: StorageProviderType = "firebase";
  readonly bucket: string;
  private readonly accessToken: string;

  constructor(input: {
    id: string;
    name: string;
    bucket: string;
    accessToken: string;
  }) {
    this.id = input.id;
    this.name = input.name;
    this.bucket = input.bucket.trim();
    this.accessToken = input.accessToken;
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const cleanPath = input.path.replace(/^\//, "");
    const stored = await uploadArtifact({
      accessToken: this.accessToken,
      bucket: this.bucket,
      path: cleanPath,
      body: input.body,
      contentType: input.contentType,
    });

    const downloadUrl = artifactDownloadUrl(this.bucket, stored.path, stored.downloadToken);
    // Path with token encoded so devices can download without extra auth
    const pathWithToken = stored.downloadToken ? `${stored.path}#${stored.downloadToken}` : stored.path;

    return {
      path: pathWithToken,
      size: stored.size,
      downloadUrl,
    };
  }

  async getDownloadUrl(path: string): Promise<string> {
    const idx = path.indexOf("#");
    const rawPath = idx === -1 ? path : path.slice(0, idx);
    const token = idx === -1 ? null : path.slice(idx + 1);
    return artifactDownloadUrl(this.bucket, rawPath, token);
  }

  async verify(): Promise<StorageVerificationResult> {
    const probePath = `fireota/.healthcheck-${Date.now()}`;
    const probePayload = new TextEncoder().encode(`healthcheck-${new Date().toISOString()}`);

    try {
      const stored = await uploadArtifact({
        accessToken: this.accessToken,
        bucket: this.bucket,
        path: probePath,
        body: probePayload,
        contentType: "text/plain",
      });
      await deleteArtifact({
        accessToken: this.accessToken,
        bucket: this.bucket,
        path: stored.path,
      });
      return {
        ok: true,
        details: { bucketExists: true, writePermitted: true, readPermitted: true, deletePermitted: true },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Firebase verification failed";
      return { ok: false, reason: "permission", message };
    }
  }

  async delete(path: string): Promise<boolean> {
    const idx = path.indexOf("#");
    const cleanPath = (idx === -1 ? path : path.slice(0, idx)).replace(/^\//, "");
    try {
      await deleteArtifact({
        accessToken: this.accessToken,
        bucket: this.bucket,
        path: cleanPath,
      });
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<{ path: string; size: number }[]> {
    return listArtifacts({
      accessToken: this.accessToken,
      bucket: this.bucket,
      prefix,
    });
  }
}

