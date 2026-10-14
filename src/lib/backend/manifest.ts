/** Server-side OTA manifest generation. A client-supplied manifest is never authoritative. */

export const MANIFEST_VERSION = 1;

export interface ManifestAsset {
  name: string;
  url: string;
  hash: string;
  size: number;
}

export interface OtaManifest {
  manifestVersion: number;
  releaseId: string;
  appId: string;
  platform: "android" | "ios";
  channel: string;
  version: string;
  runtimeVersion: string;
  nativeVersionConstraint: string;
  bundle: { url: string; hash: string; size: number };
  assets: ManifestAsset[];
  mandatory: boolean;
  rolloutPercentage: number;
  createdAt: string;
}

export function buildManifest(input: {
  releaseId: string;
  appId: string;
  platform: "android" | "ios";
  channel: string;
  version: string;
  runtimeVersion: string;
  nativeVersionConstraint: string;
  bundleUrl: string;
  bundleHash: string;
  bundleSize: number;
  assets?: ManifestAsset[];
  mandatory: boolean;
  rolloutPercentage: number;
}): OtaManifest {
  return {
    manifestVersion: MANIFEST_VERSION,
    releaseId: input.releaseId,
    appId: input.appId,
    platform: input.platform,
    channel: input.channel,
    version: input.version,
    runtimeVersion: input.runtimeVersion,
    nativeVersionConstraint: input.nativeVersionConstraint,
    bundle: { url: input.bundleUrl, hash: input.bundleHash, size: input.bundleSize },
    assets: input.assets ?? [],
    mandatory: input.mandatory,
    rolloutPercentage: input.rolloutPercentage,
    createdAt: new Date().toISOString(),
  };
}

export function validateManifest(value: unknown): value is OtaManifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Partial<OtaManifest>;
  return (
    typeof m.manifestVersion === "number" &&
    m.manifestVersion >= 1 &&
    typeof m.releaseId === "string" &&
    typeof m.appId === "string" &&
    (m.platform === "android" || m.platform === "ios") &&
    typeof m.version === "string" &&
    typeof m.runtimeVersion === "string" &&
    typeof m.bundle === "object" &&
    m.bundle !== null &&
    typeof m.bundle.hash === "string" &&
    m.bundle.hash.length === 64 &&
    typeof m.bundle.size === "number" &&
    m.bundle.size > 0
  );
}

/** Storage layout is generated server-side; user input never contributes a path segment. */
export function storagePrefix(input: {
  appId: string;
  platform: string;
  channelId: string;
  releaseId: string;
}): string {
  const safe = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, "");
  return `fireota/apps/${safe(input.appId)}/${safe(input.platform)}/${safe(input.channelId)}/releases/${safe(input.releaseId)}`;
}

/**
 * True when the bytes are a FireOTA update package (gzip of the FOTA1 magic + header + files), the
 * only format the SDK can install. Inflates just the first chunk, never the whole upload.
 */
export async function isFireOtaPackage(bytes: Uint8Array): Promise<boolean> {
  if (bytes.byteLength < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return false;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    const reader = stream.getReader();
    const collected: number[] = [];
    while (collected.length < 6) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      collected.push(...value.subarray(0, 6 - collected.length));
    }
    await reader.cancel().catch(() => undefined);
    return String.fromCharCode(...collected) === "FOTA1\n";
  } catch {
    return false;
  }
}
