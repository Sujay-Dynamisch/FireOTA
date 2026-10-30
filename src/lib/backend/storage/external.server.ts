/**
 * Bring-Your-Own-URL (BYOU) Storage Provider.
 * Allows organizations whose CI/CD already publishes bundles to internal CDNs,
 * GitHub Releases, or corporate artifact repositories to register updates
 * by supplying direct download URLs and SHA-256 hashes.
 */
import type {
  StorageProvider,
  StorageProviderType,
  StorageUploadInput,
  StorageUploadResult,
  StorageVerificationResult,
} from "./types";

export class ExternalUrlStorageProvider implements StorageProvider {
  readonly id: string;
  readonly name: string;
  readonly provider: StorageProviderType = "external";
  readonly bucket: string | null = null;
  readonly publicCdnUrl?: string;

  constructor(input: { id: string; name: string; publicCdnUrl?: string }) {
    this.id = input.id;
    this.name = input.name;
    this.publicCdnUrl = input.publicCdnUrl;
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    // In BYOU mode, files are uploaded directly by the customer's CI/CD.
    // If an upload is called through the API, it returns the external URL.
    const url = this.publicCdnUrl
      ? `${this.publicCdnUrl.replace(/\/$/, "")}/${input.path.replace(/^\//, "")}`
      : input.path;

    return {
      path: input.path,
      size: input.body.byteLength,
      downloadUrl: url,
    };
  }

  async getDownloadUrl(path: string): Promise<string> {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    if (this.publicCdnUrl) {
      return `${this.publicCdnUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    }
    return path;
  }

  async verify(): Promise<StorageVerificationResult> {
    if (this.publicCdnUrl) {
      try {
        const res = await fetch(this.publicCdnUrl, { method: "HEAD" });
        return { ok: res.status < 500 };
      } catch (err) {
        return { ok: false, reason: "endpoint_unreachable", message: String(err) };
      }
    }
    return { ok: true };
  }

  async delete(_path: string): Promise<boolean> {
    // FireOTA does not delete external customer CDN assets.
    return true;
  }

  async list(_prefix: string): Promise<{ path: string; size: number }[]> {
    return [];
  }
}

