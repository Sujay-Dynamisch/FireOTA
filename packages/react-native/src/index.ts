/**
 * FireOTA React Native SDK.
 *
 * Flow: check -> download (native, SHA-256 verified) -> install (pending) -> applied on the
 * next start (or immediately for mandatory updates) -> the new bundle confirms itself on
 * launch; a bundle that never confirms is rolled back to the previous one by the native loader.
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
  /** Check (and download) automatically when configure() runs. Default true. */
  checkOnAppStart?: boolean;
  /** When a normal update is applied. Default "nextRestart". */
  installMode?: InstallMode;
  /** When a mandatory update is applied. Default "immediate". */
  mandatoryInstallMode?: InstallMode;
  onStatusChange?: (status: UpdateStatus, detail?: { releaseId?: string; error?: string }) => void;
}

export interface AvailableUpdate {
  id: string;
  version: string;
  runtimeVersion: string;
  mandatory: boolean;
  notes: string;
  bundle: { url: string; hash: string; size: number };
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
}

const native = NativeModules["FireOTA"] as FireOTANative | undefined;
const PROTOCOL_VERSION = "1";

let config: Required<Omit<FireOTAConfig, "onStatusChange">> & Pick<FireOTAConfig, "onStatusChange">;
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

/** Downloads and verifies (SHA-256) an update. The running bundle is untouched. */
export async function downloadUpdate(release: AvailableUpdate) {
  if (!/^[0-9a-f]{64}$/i.test(release.bundle.hash)) throw new Error("The update has no valid checksum.");
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
