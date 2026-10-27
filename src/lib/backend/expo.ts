/**
 * Expo Updates protocol (v1) support, so apps using `expo-updates` can point
 * `updates.url` at FireOTA instead of EAS Update. Spec:
 * https://docs.expo.dev/technical-specs/expo-updates-1/
 *
 * Pure helpers only: building the stored manifest template at upload time, and the
 * multipart response the expo-updates client expects at check time.
 */
import { createHash } from "node:crypto";

export interface ExpoAsset {
  /** base64url SHA-256 of the file, verified by expo-updates after download. */
  hash: string;
  /** Stable identifier; Expo uses the asset's md5 file name. */
  key: string;
  contentType: string;
  fileExtension?: string;
  url: string;
}

/** Stored on the release as `manifest.expo` when the update was published from `expo export`. */
export interface ExpoManifestTemplate {
  launchAsset: ExpoAsset;
  assets: ExpoAsset[];
  /** Public app config (`expo config --type public`), exposed to the app as Constants.expoConfig. */
  expoClient: Record<string, unknown> | null;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  json: "application/json",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  lottie: "application/json",
};

export function expoContentType(ext: string): string {
  return MIME[ext.replace(/^\./, "").toLowerCase()] ?? "application/octet-stream";
}

export function base64UrlSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

/** The manifest body served to a device; `id` is the FireOTA release UUID. */
export function expoManifest(input: {
  releaseId: string;
  createdAt: string;
  runtimeVersion: string;
  template: ExpoManifestTemplate;
}) {
  return {
    id: input.releaseId,
    createdAt: new Date(input.createdAt).toISOString(),
    runtimeVersion: input.runtimeVersion,
    launchAsset: input.template.launchAsset,
    assets: input.template.assets,
    metadata: {},
    extra: {
      ...(input.template.expoClient ? { expoClient: input.template.expoClient } : {}),
      fireota: { releaseId: input.releaseId },
    },
  };
}

export type ExpoDirective =
  | { type: "noUpdateAvailable" }
  | { type: "rollBackToEmbedded"; parameters: { commitTime: string } };

/** Builds the `multipart/mixed` body of a protocol v1 response (one manifest or directive part). */
export function expoMultipart(part: { name: "manifest" | "directive"; json: unknown }, boundary: string = crypto.randomUUID()) {
  const CRLF = "\r\n";
  const body = [
    `--${boundary}`,
    `content-disposition: form-data; name="${part.name}"`,
    "content-type: application/json; charset=utf-8",
    "",
    JSON.stringify(part.json),
    `--${boundary}`,
    'content-disposition: form-data; name="extensions"',
    "content-type: application/json",
    "",
    JSON.stringify({ assetRequestHeaders: {} }),
    `--${boundary}--`,
    "",
  ].join(CRLF);
  return { body, contentType: `multipart/mixed; boundary=${boundary}` };
}

export const EXPO_RESPONSE_HEADERS = {
  "expo-protocol-version": "1",
  "expo-sfv-version": "0",
  "cache-control": "private, max-age=0",
} as const;
