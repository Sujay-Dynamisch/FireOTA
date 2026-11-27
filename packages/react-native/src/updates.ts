/**
 * expo-updates parity layer for FireOTA.
 *
 * Developers moving from expo-updates / EAS Update can use the same API names and conventions:
 *   Updates.checkForUpdateAsync()
 *   Updates.fetchUpdateAsync()
 *   Updates.reloadAsync()
 *   Updates.readLogEntriesAsync() / clearLogEntriesAsync()
 *   useUpdates() hook
 */
import { useEffect, useState } from "react";
import {
  checkForUpdate,
  clearLogEntriesAsync,
  downloadUpdate,
  getSnapshot,
  installUpdate,
  readLogEntriesAsync,
  reload,
  subscribe,
  type AvailableUpdate,
  type FireOTASnapshot,
  type UpdatesLogEntry,
} from "./core";

export type { UpdatesLogEntry };

export interface UpdateManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: {
    hash: string;
    key: string;
    contentType: string;
    url: string;
  };
  assets: Array<{
    hash: string;
    key: string;
    contentType: string;
    url: string;
  }>;
  metadata: Record<string, string>;
  extra: Record<string, any>;
  version?: string;
  notes?: string;
  message?: string;
  groupId?: string | null;
  mandatory?: boolean;
  bundle?: { url: string; hash: string; size: number };
  signature?: { value: string; keyId: string | null; algorithm: string } | null;
}

export interface UpdateCheckResult {
  isAvailable: boolean;
  manifest?: UpdateManifest;
  reason?: string;
  isRollBackToEmbedded?: boolean;
}

export interface UpdateFetchResult {
  isNew: boolean;
  manifest?: UpdateManifest;
  isRollBackToEmbedded?: boolean;
}

export interface UpdateInfo {
  updateId?: string;
  createdAt?: string;
  manifest?: UpdateManifest;
  isEmbedded?: boolean;
}

export interface UseUpdatesReturnValue {
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean;
  availableUpdate?: UpdateInfo;
  downloadedUpdate?: UpdateInfo;
  currentlyRunning: UpdateInfo;
  checkError?: Error;
  downloadError?: Error;
  downloadProgress?: number;
  lastCheckForUpdateTimeSinceRestart?: Date;
  /** Alias for lastCheckForUpdateTimeSinceRestart for full expo-updates compatibility */
  lastCheckForUpdateTime?: Date;
  initializationError?: Error;
}

/** Converts a FireOTA AvailableUpdate into an expo-updates compatible manifest object */
export function toUpdateManifest(update: AvailableUpdate): UpdateManifest {
  return {
    id: update.id,
    createdAt: update.createdAt ?? new Date().toISOString(),
    runtimeVersion: update.runtimeVersion,
    launchAsset: {
      hash: update.bundle.hash,
      key: "bundle",
      contentType: "application/javascript",
      url: update.bundle.url,
    },
    assets: [],
    metadata: {
      notes: update.notes || "",
      ...(update.message ? { message: update.message } : {}),
    },
    extra: {
      fireota: {
        version: update.version,
        groupId: update.groupId,
        mandatory: update.mandatory,
      },
    },
    version: update.version,
    notes: update.notes,
    message: update.message,
    groupId: update.groupId,
    mandatory: update.mandatory,
    bundle: update.bundle,
    signature: update.signature,
  };
}

/** Queries the FireOTA update server for an available update matching this build */
export async function checkForUpdateAsync(): Promise<UpdateCheckResult> {
  const result = await checkForUpdate();
  if (result.updateAvailable && result.release) {
    return {
      isAvailable: true,
      manifest: toUpdateManifest(result.release),
    };
  }
  return {
    isAvailable: false,
    reason: result.reason,
  };
}

/** Downloads and stages the latest update for application on the next restart */
export async function fetchUpdateAsync(): Promise<UpdateFetchResult> {
  const currentSnapshot = getSnapshot();
  let release = currentSnapshot.available;

  if (!release) {
    const checkResult = await checkForUpdate();
    if (checkResult.updateAvailable && checkResult.release) {
      release = checkResult.release;
    }
  }

  if (!release) {
    return { isNew: false };
  }

  await downloadUpdate(release);
  await installUpdate(release, "nextRestart");

  return {
    isNew: true,
    manifest: toUpdateManifest(release),
  };
}

/** Restarts the application immediately so that a staged pending update is loaded */
export async function reloadAsync(): Promise<void> {
  return reload();
}

/**
 * Reactive hook for tracking update status across the application lifecycle.
 * Drop-in replacement for expo-updates `useUpdates()`.
 */
export function useUpdates(): UseUpdatesReturnValue {
  const [snapshot, setSnapshot] = useState<FireOTASnapshot>(getSnapshot());

  useEffect(() => {
    return subscribe(setSnapshot);
  }, []);

  const isChecking = snapshot.status === "checking";
  const isDownloading = snapshot.status === "downloading";
  const isUpdateAvailable = snapshot.available !== null;
  const isUpdatePending = snapshot.pendingReleaseId !== null;

  const availableUpdate: UpdateInfo | undefined = snapshot.available
    ? {
        updateId: snapshot.available.id,
        createdAt: snapshot.available.createdAt,
        manifest: toUpdateManifest(snapshot.available),
      }
    : undefined;

  const downloadedUpdate: UpdateInfo | undefined = snapshot.pendingReleaseId
    ? snapshot.available && snapshot.available.id === snapshot.pendingReleaseId
      ? {
          updateId: snapshot.pendingReleaseId,
          createdAt: snapshot.available.createdAt,
          manifest: toUpdateManifest(snapshot.available),
        }
      : { updateId: snapshot.pendingReleaseId }
    : undefined;

  const currentlyRunning: UpdateInfo = {
    updateId: snapshot.currentReleaseId ?? undefined,
    isEmbedded: snapshot.currentReleaseId === null,
  };

  const errorObj = snapshot.error ? new Error(snapshot.error) : undefined;
  const checkError = snapshot.status === "error" && !snapshot.available ? errorObj : undefined;
  const downloadError = snapshot.status === "error" && snapshot.available ? errorObj : undefined;
  const lastCheckTime = snapshot.lastCheckedAt ? new Date(snapshot.lastCheckedAt) : undefined;

  return {
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
    availableUpdate,
    downloadedUpdate,
    currentlyRunning,
    checkError,
    downloadError,
    downloadProgress: snapshot.downloadProgress ?? undefined,
    lastCheckForUpdateTimeSinceRestart: lastCheckTime,
    lastCheckForUpdateTime: lastCheckTime,
  };
}

/**
 * Drop-in `Updates` object matching expo-updates.
 */
export const Updates = {
  get channel(): string {
    return getSnapshot().channel;
  },
  get runtimeVersion(): string {
    return getSnapshot().runtimeVersion;
  },
  get updateId(): string | null {
    return getSnapshot().currentReleaseId;
  },
  get isEnabled(): boolean {
    return getSnapshot().configured;
  },
  get isEmbeddedLaunch(): boolean {
    return getSnapshot().currentReleaseId === null;
  },
  get isEmergencyLaunch(): boolean {
    return false;
  },
  get emergencyLaunchReason(): string | null {
    return null;
  },
  get createdAt(): Date | undefined {
    return undefined;
  },
  checkForUpdateAsync,
  fetchUpdateAsync,
  reloadAsync,
  readLogEntriesAsync,
  clearLogEntriesAsync,
};
