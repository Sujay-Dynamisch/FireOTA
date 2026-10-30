/**
 * Sovereign Storage Provider Interfaces and Types for FireOTA.
 *
 * FireOTA enforces Zero Proprietary Bundle Storage: customer application
 * bundles live exclusively in the customer's own cloud storage (AWS S3,
 * Cloudflare R2, Google Cloud Storage, MinIO, Wasabi, Azure Blob, or custom CDN).
 */

export type StorageProviderType =
  | "s3"
  | "r2"
  | "gcs"
  | "minio"
  | "azure"
  | "firebase"
  | "external";

export interface StorageUploadInput {
  path: string;
  body: Uint8Array;
  contentType: string;
}

export interface StorageUploadResult {
  path: string;
  size: number;
  downloadUrl: string;
}

export type StorageFailureReason =
  | "billing"
  | "permission"
  | "bucket_missing"
  | "auth_expired"
  | "endpoint_unreachable"
  | "invalid_credentials"
  | "unknown";

export interface StorageVerificationResult {
  ok: boolean;
  reason?: StorageFailureReason;
  message?: string;
  details?: {
    bucketExists?: boolean;
    writePermitted?: boolean;
    readPermitted?: boolean;
    deletePermitted?: boolean;
  };
}

export interface StorageProvider {
  readonly id: string;
  readonly name: string;
  readonly provider: StorageProviderType;
  readonly bucket: string | null;

  /** Uploads a file/bundle to the client's own storage bucket */
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;

  /** Generates or formats a direct download URL (presigned or public CDN) */
  getDownloadUrl(path: string, options?: { expiresInSeconds?: number }): Promise<string>;

  /**
   * Verifies live connectivity, bucket existence, and write+read+delete permissions
   * by writing a temporary healthcheck object and removing it.
   */
  verify(): Promise<StorageVerificationResult>;

  /** Deletes an artifact from storage */
  delete(path: string): Promise<boolean>;

  /** Lists objects under a prefix (for cleanup and health probes) */
  list(prefix: string): Promise<{ path: string; size: number }[]>;
}

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  region?: string;
  forcePathStyle?: boolean;
  publicCdnUrl?: string;
}

export interface GCSCredentials {
  serviceAccountJson?: string;
  clientEmail?: string;
  privateKey?: string;
  projectId?: string;
}

export interface AzureCredentials {
  accountName: string;
  accountKey: string;
  containerName?: string;
  endpoint?: string;
}

export interface StorageTargetRecordData {
  id: string;
  organizationId: string;
  name: string;
  provider: StorageProviderType;
  bucket: string | null;
  endpoint: string | null;
  region: string | null;
  publicCdnUrl: string | null;
  status: string;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

