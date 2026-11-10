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

/**
 * Reads one small file out of a FireOTA package, inflating only as far as that file. Returns
 * null when the package does not contain it.
 */
export async function readPackageFile(bytes: Uint8Array, path: string, maxSize = 64 * 1024): Promise<string | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const fill = async (length: number) => {
    while (total < length) {
      const { value, done } = await reader.read();
      if (done || !value) return false;
      chunks.push(value);
      total += value.byteLength;
    }
    return true;
  };
  const slice = (start: number, end: number) => {
    const out = new Uint8Array(end - start);
    let offset = 0;
    for (const chunk of chunks) {
      const from = Math.max(start - offset, 0);
      const to = Math.min(end - offset, chunk.byteLength);
      if (from < to) out.set(chunk.subarray(from, to), offset + from - start);
      offset += chunk.byteLength;
      if (offset >= end) break;
    }
    return out;
  };
  try {
    if (!(await fill(10))) return null;
    const head = slice(0, 10);
    if (new TextDecoder().decode(head.subarray(0, 6)) !== "FOTA1\n") return null;
    const headerLength = new DataView(head.buffer, head.byteOffset).getUint32(6);
    if (headerLength <= 0 || headerLength > 4 * 1024 * 1024 || !(await fill(10 + headerLength))) return null;
    const header = JSON.parse(new TextDecoder().decode(slice(10, 10 + headerLength))) as { files?: { path: string; size: number }[] };
    let offset = 10 + headerLength;
    for (const file of header.files ?? []) {
      if (file.path === path) {
        if (file.size > maxSize || !(await fill(offset + file.size))) return null;
        return new TextDecoder().decode(slice(offset, offset + file.size));
      }
      offset += file.size;
    }
    return null;
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** The `fireota.json` descriptor of a Flutter update, as the CLI writes it. */
export interface FlutterDescriptor {
  version: number;
  kind: "flutter-aot" | "flutter-assets";
  runtimeVersion: string;
  buildId?: string;
  flutterVersion?: string;
  engineRevision?: string;
  pluginsHash?: string;
  /** SHA-256 of the store build's libapp.so per ABI that a code patch was compiled against. */
  base?: Record<string, string>;
}

/**
 * The Flutter descriptor of a package, or null for a React Native package. Throws when a Flutter
 * package is malformed or built for another runtime.
 */
export async function flutterDescriptor(bytes: Uint8Array, release: { runtime_version: string; platform: string }) {
  const raw = await readPackageFile(bytes, "fireota.json");
  if (raw === null) return null;
  let value: Partial<FlutterDescriptor>;
  try {
    value = JSON.parse(raw) as Partial<FlutterDescriptor>;
  } catch {
    throw new Error("The package's fireota.json is not valid JSON.");
  }
  if (value.kind !== "flutter-aot" && value.kind !== "flutter-assets") throw new Error("Unknown Flutter update kind.");
  if (value.runtimeVersion !== release.runtime_version) {
    throw new Error(`This update was built for runtime ${value.runtimeVersion}, but the release is for ${release.runtime_version}.`);
  }
  if (value.kind === "flutter-aot") {
    if (release.platform !== "android") throw new Error("Flutter code patches are Android only.");
    const base = value.base ?? {};
    if (!value.buildId || !Object.keys(base).length || !Object.values(base).every((h) => /^[0-9a-f]{64}$/i.test(String(h)))) {
      throw new Error("The code patch has no valid build ID or base fingerprints; build it with `fireota flutter patch`.");
    }
  }
  return value as FlutterDescriptor;
}
