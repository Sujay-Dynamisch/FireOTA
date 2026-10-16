/**
 * FireOTA React Native SDK.
 *
 * Flow: check -> (signature verified, when code signing is on) -> download (native, SHA-256
 * verified) -> install (pending) -> applied on the next start (or immediately for mandatory
 * updates) -> the new bundle confirms itself on launch; a bundle that never confirms is
 * rolled back to the previous one by the native loader.
 *
 * Updates are identified by their ID (like Expo) and target exactly one runtime version.
 */
import { NativeModules, Platform } from "react-native";

export type InstallMode = "nextRestart" | "immediate";
export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "downloading"
  | "downloaded"
  | "installed"
  | "error";

export interface FireOTAConfig {
  /** App ID from the FireOTA dashboard (Applications -> your app). */
  appId: string;
  /** Your FireOTA deployment, e.g. https://ota.example.com */
  serverUrl: string;
  /** Must equal the runtime version of the release; bump it whenever native code changes. */
  runtimeVersion: string;
  channel?: string;
  /**
   * PEM public key (contents of fireota-public.pem). When set, every update must carry a valid
   * signature from the matching private key or it is rejected before download.
   */
  codeSigningCertificate?: string;
  /** Check (and download) automatically when configure() runs. Default true. */
  checkOnAppStart?: boolean;
  /** When a normal update is applied. Default "nextRestart". */
  installMode?: InstallMode;
  /** When a mandatory update is applied. Default "immediate". */
  mandatoryInstallMode?: InstallMode;
  onStatusChange?: (status: UpdateStatus, detail?: { releaseId?: string; error?: string }) => void;
}

export interface AvailableUpdate {
  /** The update's unique ID. */
  id: string;
  /** Optional human label set by the publisher ("" when none). */
  version: string;
  runtimeVersion: string;
  mandatory: boolean;
  notes: string;
  /** What changed, as written by the publisher (same as notes). */
  message?: string;
  /** Shared by the Android and iOS updates published together. */
  groupId?: string | null;
  createdAt?: string;
  bundle: { url: string; hash: string; size: number };
  signature?: { value: string; keyId: string | null; algorithm: string } | null;
}

export interface CheckResult {
  updateAvailable: boolean;
  reason?: string;
  release?: AvailableUpdate;
}

interface NativeState {
  installationId: string;
  nativeVersion: string;
  appVersion: string;
  currentReleaseId: string | null;
  pendingReleaseId: string | null;
  previousReleaseId: string | null;
  /** Release rolled back by the native loader because it never confirmed a launch. */
  failedReleaseId: string | null;
  /** The running bundle has not confirmed a successful launch yet. */
  isFirstRun: boolean;
}

interface FireOTANative {
  getState(): Promise<NativeState>;
  downloadUpdate(url: string, sha256: string, releaseId: string): Promise<void>;
  installUpdate(releaseId: string): Promise<void>;
  markSuccess(): Promise<void>;
  clearPending(): Promise<void>;
  clearFailed(): Promise<void>;
  restartApp(): Promise<void>;
  verifySignature(message: string, signatureBase64: string, publicKeyBase64: string): Promise<boolean>;
}

const native = NativeModules["FireOTA"] as FireOTANative | undefined;
const PROTOCOL_VERSION = "1";

let config: Required<Omit<FireOTAConfig, "onStatusChange" | "codeSigningCertificate">> &
  Pick<FireOTAConfig, "onStatusChange" | "codeSigningCertificate">;
let status: UpdateStatus = "idle";
let running: Promise<CheckResult> | null = null;

function requireNative(): FireOTANative {
  if (!native) {
    throw new Error(
      "FireOTA native module not found. Rebuild the app after installing @fireota/react-native (cd ios && pod install).",
    );
  }
  return native;
}

function requireConfig() {
  if (!config) throw new Error("Call FireOTA.configure() before using the SDK.");
  return config;
}

function setStatus(next: UpdateStatus, detail?: { releaseId?: string; error?: string }) {
  status = next;
  config?.onStatusChange?.(next, detail);
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${requireConfig().serverUrl.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-fireota-sdk": `react-native/${PROTOCOL_VERSION}` },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { success: boolean; data?: T; error?: { code: string; message: string } };
  if (!json.success) throw new Error(json.error?.message ?? `FireOTA request failed (${response.status})`);
  return json.data as T;
}

/** Telemetry never blocks or fails an update. */
async function report(event: string, releaseId: string, metadata?: Record<string, unknown>) {
  try {
    const state = await requireNative().getState();
    await post("/api/public/v1/updates/events", {
      app: config.appId,
      releaseId,
      platform: Platform.OS,
      installationId: state.installationId,
      runtimeVersion: config.runtimeVersion,
      nativeVersion: state.nativeVersion,
      appVersion: state.appVersion,
      event,
      eventId: `${event}:${releaseId}:${state.installationId}`,
      ...(metadata ? { metadata } : {}),
    });
  } catch {
    // ignored by design
  }
}

/** Asks FireOTA whether a compatible release exists for this device. */
export async function checkForUpdate(): Promise<CheckResult> {
  const cfg = requireConfig();
  const state = await requireNative().getState();
  setStatus("checking");
  const result = await post<CheckResult>("/api/public/v1/updates/check", {
    app: cfg.appId,
    channel: cfg.channel,
    platform: Platform.OS,
    installationId: state.installationId,
    runtimeVersion: cfg.runtimeVersion,
    nativeVersion: state.nativeVersion,
    appVersion: state.appVersion,
    currentReleaseId: state.pendingReleaseId ?? state.currentReleaseId,
  });
  // Defence in depth: never accept a release built for another runtime.
  if (result.updateAvailable && result.release?.runtimeVersion !== cfg.runtimeVersion) {
    return { updateAvailable: false, reason: "runtime_incompatible" };
  }
  if (!result.updateAvailable) setStatus("upToDate");
  return result;
}

// ---------- code signing ----------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]!) : 0));
    const triple = (n[0]! << 18) | (n[1]! << 12) | (n[2]! << 6) | n[3]!;
    out.push((triple >> 16) & 255);
    if (i + 2 < clean.length) out.push((triple >> 8) & 255);
    if (i + 3 < clean.length) out.push(triple & 255);
  }
  return new Uint8Array(out);
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const triple = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(triple >> 18) & 63]! + B64[(triple >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(triple >> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? B64[triple & 63]! : "=";
  }
  return out;
}

/** Reads one DER element header; returns where its content starts and how long it is. */
function derElement(der: Uint8Array, offset: number) {
  let length = der[offset + 1]!;
  let start = offset + 2;
  if (length & 0x80) {
    const bytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < bytes; i += 1) length = (length << 8) | der[start + i]!;
    start += bytes;
  }
  return { tag: der[offset]!, start, end: start + length };
}

/**
 * The certificate is a PEM "PUBLIC KEY" (X.509 SubjectPublicKeyInfo). Android accepts that
 * directly; iOS's SecKeyCreateWithData wants the inner PKCS#1 RSAPublicKey.
 */
function publicKeyForPlatform(pem: string): string {
  const spki = base64ToBytes(pem.replace(/-----[^-]+-----/g, ""));
  if (Platform.OS !== "ios") return bytesToBase64(spki);
  const outer = derElement(spki, 0); // SEQUENCE
  const algorithm = derElement(spki, outer.start); // SEQUENCE { oid, null }
  const bitString = derElement(spki, algorithm.end); // BIT STRING
  if (outer.tag !== 0x30 || algorithm.tag !== 0x30 || bitString.tag !== 0x03) throw new Error("Invalid code signing certificate.");
  return bytesToBase64(spki.slice(bitString.start + 1, bitString.end)); // skip the unused-bits byte
}

/** Same message the CLI signs and the server verifies. */
function signatureMessage(runtimeVersion: string, platform: string, sha256: string) {
  return `fireota-update-v1\n${runtimeVersion}\n${platform}\n${sha256.toLowerCase()}`;
}

async function assertSigned(release: AvailableUpdate) {
  const certificate = config.codeSigningCertificate;
  if (!certificate) return;
  const signature = release.signature?.value;
  const valid = signature
    ? await requireNative().verifySignature(
        signatureMessage(config.runtimeVersion, Platform.OS, release.bundle.hash),
        signature,
        publicKeyForPlatform(certificate),
      )
    : false;
  if (!valid) {
    void report("install_failed", release.id, { reason: signature ? "signature_invalid" : "unsigned" });
    throw new Error(signature ? "The update signature is not valid for this app." : "The update is not signed; this app only accepts signed updates.");
  }
}

/** Verifies the signature (when code signing is on), then downloads and checks SHA-256. The running bundle is untouched. */
export async function downloadUpdate(release: AvailableUpdate) {
  if (!/^[0-9a-f]{64}$/i.test(release.bundle.hash)) throw new Error("The update has no valid checksum.");
  await assertSigned(release);
  setStatus("downloading", { releaseId: release.id });
  void report("download_started", release.id);
  await requireNative().downloadUpdate(release.bundle.url, release.bundle.hash.toLowerCase(), release.id);
  void report("download_completed", release.id);
  setStatus("downloaded", { releaseId: release.id });
}

/** Marks a downloaded update to load on the next start, or restarts now for "immediate". */
export async function installUpdate(release: AvailableUpdate, mode: InstallMode = "nextRestart") {
  await requireNative().installUpdate(release.id);
  setStatus("installed", { releaseId: release.id });
  if (mode === "immediate") await requireNative().restartApp();
}

/** Check + download + install in one call, honouring the configured install modes. */
export function sync(): Promise<CheckResult> {
  if (running) return running;
  running = (async () => {
    try {
      const result = await checkForUpdate();
      if (result.updateAvailable && result.release) {
        await downloadUpdate(result.release);
        await installUpdate(
          result.release,
          result.release.mandatory ? config.mandatoryInstallMode : config.installMode,
        );
      }
      return result;
    } catch (error) {
      setStatus("error", { error: error instanceof Error ? error.message : String(error) });
      // Never crash the host app: it keeps running the bundle it already has.
      return { updateAvailable: false, reason: "error" };
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Restarts the app so a pending update loads now. */
export function reload() {
  return requireNative().restartApp();
}

/** Drops a downloaded-but-not-yet-applied update. */
export function clearPendingUpdate() {
  return requireNative().clearPending();
}

/** The release the app is running, or null for the bundle shipped in the binary. */
export async function getCurrentRelease() {
  const state = await requireNative().getState();
  return { releaseId: state.currentReleaseId, pendingReleaseId: state.pendingReleaseId, installationId: state.installationId };
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

/**
 * Configures the SDK. Call once, as early as possible (e.g. index.js or the root component).
 * Reaching this call proves the running bundle starts, so it is confirmed here; a bundle that
 * crashes before this point is rolled back automatically on the next launch.
 */
export async function configure(options: FireOTAConfig) {
  if (!options.appId || !options.serverUrl || !options.runtimeVersion) {
    throw new Error("FireOTA.configure() needs appId, serverUrl and runtimeVersion.");
  }
  config = {
    channel: "production",
    checkOnAppStart: true,
    installMode: "nextRestart",
    mandatoryInstallMode: "immediate",
    ...options,
  };
  const nativeModule = requireNative();
  const state = await nativeModule.getState();

  if (state.failedReleaseId) {
    void report("rollback", state.failedReleaseId, { reason: "launch_not_confirmed" });
    void report("install_failed", state.failedReleaseId, { reason: "launch_not_confirmed" });
    await nativeModule.clearFailed();
  }
  if (state.isFirstRun && state.currentReleaseId) {
    await nativeModule.markSuccess();
    void report("install_succeeded", state.currentReleaseId);
  }
  if (config.checkOnAppStart) void sync();
}

export const FireOTA = {
  configure,
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  sync,
  reload,
  clearPendingUpdate,
  getCurrentRelease,
  getUpdateStatus,
};

export default FireOTA;
