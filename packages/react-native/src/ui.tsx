/**
 * Ready-made UI for FireOTA. Works out of the box; every piece can be restyled or replaced.
 *
 *   <FireOTAProvider config={fireotaConfig}>   configures the SDK and shows <UpdatePrompt />
 *   useFireOTA()                                state + actions for your own UI
 *   <UpdateScreen />                            a complete "App updates" settings screen
 *   withFireOTA(App, fireotaConfig)             one-line wrapper used by `npx fireota init`
 *
 * The built-in prompt is a Material 3 style dialog flow that follows the system light/dark mode:
 *   "Update available" → Update → download progress → "Update ready" → Restart.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";

import {
  checkForUpdate,
  configure,
  downloadUpdate,
  getSnapshot,
  installUpdate,
  reload,
  subscribe,
  type AvailableUpdate,
  type FireOTAConfig,
  type FireOTASnapshot,
} from "./core";

export interface FireOTATheme {
  /** Buttons, progress and icons (Material "primary"). */
  accent: string;
  /** Text and icons drawn on `accent`. */
  onAccent: string;
  /** Tonal container behind icons and the progress track. */
  accentContainer: string;
  /** Screen background. */
  background: string;
  /** Dialog and card surface. */
  card: string;
  text: string;
  muted: string;
  danger: string;
  /** Dimmed backdrop behind dialogs. */
  scrim: string;
}

/** Material 3 baseline, light. */
export const lightTheme: FireOTATheme = {
  accent: "#6750A4",
  onAccent: "#FFFFFF",
  accentContainer: "#EADDFF",
  background: "#FEF7FF",
  card: "#F3EDF7",
  text: "#1D1B20",
  muted: "#49454F",
  danger: "#B3261E",
  scrim: "rgba(0,0,0,0.32)",
};

/** Material 3 baseline, dark. */
export const darkTheme: FireOTATheme = {
  accent: "#D0BCFF",
  onAccent: "#381E72",
  accentContainer: "#4F378B",
  background: "#141218",
  card: "#2B2930",
  text: "#E6E0E9",
  muted: "#CAC4D0",
  danger: "#F2B8B5",
  scrim: "rgba(0,0,0,0.5)",
};

/** @deprecated Use lightTheme / darkTheme; the provider picks one from the system color scheme. */
export const defaultTheme: FireOTATheme = darkTheme;

export type FireOTAColorScheme = "auto" | "light" | "dark";

export interface FireOTAActions {
  /** Asks the server whether an update exists for this build. */
  check: () => Promise<void>;
  /** Downloads and verifies the available update, then applies it on the next restart. */
  install: () => Promise<void>;
  /** Restarts the app now so a downloaded update takes effect. */
  restart: () => Promise<void>;
  busy: boolean;
  /** Last error from an action started through these helpers. */
  actionError: string | null;
}

export type FireOTAContextValue = FireOTASnapshot & FireOTAActions & { theme: FireOTATheme };

const Context = createContext<FireOTAContextValue | null>(null);

function useSnapshot() {
  const [state, setState] = useState<FireOTASnapshot>(getSnapshot());
  useEffect(() => subscribe(setState), []);
  return state;
}

function useActions(snapshot: FireOTASnapshot): FireOTAActions {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  return useMemo(() => {
    const run = async (work: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      try {
        await work();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    };
    return {
      busy,
      actionError,
      check: () => run(() => checkForUpdate()),
      install: () =>
        run(async () => {
          const release: AvailableUpdate | null = snapshot.available;
          if (!release) return;
          await downloadUpdate(release);
          await installUpdate(release, "nextRestart");
        }),
      restart: () => run(() => reload()),
    };
  }, [busy, actionError, snapshot.available]);
}

function useTheme(colorScheme: FireOTAColorScheme, overrides?: Partial<FireOTATheme>) {
  const system = useColorScheme();
  const dark = colorScheme === "dark" || (colorScheme === "auto" && system === "dark");
  return useMemo(() => ({ ...(dark ? darkTheme : lightTheme), ...overrides }), [dark, overrides]);
}

/**
 * Configures FireOTA once and provides update state to the app. Renders the built-in
 * <UpdatePrompt /> unless `prompt={false}` or a custom `renderPrompt` is given.
 *
 * With the built-in prompt, optional updates wait for the user to tap "Update" (unless the config
 * sets `autoDownload: true`); mandatory updates always download straight away.
 */
export function FireOTAProvider({
  config,
  children,
  prompt = true,
  renderPrompt,
  theme,
  colorScheme = "auto",
}: {
  config: FireOTAConfig;
  children: ReactNode;
  prompt?: boolean;
  renderPrompt?: (value: FireOTAContextValue) => ReactNode;
  /** Colors to override, e.g. `{ accent: "#FF5A1F" }` to match your brand. */
  theme?: Partial<FireOTATheme>;
  /** "auto" follows the device's light/dark setting. */
  colorScheme?: FireOTAColorScheme;
}) {
  const snapshot = useSnapshot();
  const actions = useActions(snapshot);
  const merged = useTheme(colorScheme, theme);

  useEffect(() => {
    const builtInDialog = prompt && !renderPrompt;
    // Never let update plumbing crash the app: the bundle it shipped with keeps running.
    configure(builtInDialog ? { autoDownload: false, ...config } : config).catch((error: unknown) =>
      console.warn("[FireOTA]", error instanceof Error ? error.message : error),
    );
    // Configure once per app launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: FireOTAContextValue = { ...snapshot, ...actions, theme: merged };
  return (
    <Context.Provider value={value}>
      {children}
      {renderPrompt ? renderPrompt(value) : prompt ? <UpdatePrompt askBeforeDownload={config.autoDownload !== true} /> : null}
    </Context.Provider>
  );
}

/** Update state and actions. Works inside <FireOTAProvider>, or on its own after configure(). */
export function useFireOTA(): FireOTAContextValue {
  const context = useContext(Context);
  const snapshot = useSnapshot();
  const actions = useActions(snapshot);
  const fallbackTheme = useTheme("auto");
  return context ?? { ...snapshot, ...actions, theme: fallbackTheme };
}

export interface UpdatePromptLabels {
  availableTitle: string;
  availableBody: string;
  update: string;
  notNow: string;
  downloadingTitle: string;
  requiredTitle: string;
  downloadingBody: string;
  hide: string;
  readyTitle: string;
  readyBody: string;
  restart: string;
  later: string;
  failedTitle: string;
  retry: string;
  close: string;
}

export const defaultPromptLabels: UpdatePromptLabels = {
  availableTitle: "Update available",
  availableBody: "A new version of the app is ready to download.",
  update: "Update",
  notNow: "Not now",
  downloadingTitle: "Downloading update",
  requiredTitle: "Installing an important update",
  downloadingBody: "You can keep using the app while this finishes.",
  hide: "Hide",
  readyTitle: "Update ready",
  readyBody: "Restart the app to start using the new version.",
  restart: "Restart now",
  later: "Later",
  failedTitle: "Update failed",
  retry: "Try again",
  close: "Close",
};

function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A Material 3 linear progress indicator; indeterminate when `value` is null. */
export function ProgressBar({ value, theme }: { value: number | null; theme: FireOTATheme }) {
  const progress = useRef(new Animated.Value(value ?? 0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value === null) return;
    Animated.timing(progress, { toValue: value, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, progress]);

  useEffect(() => {
    if (value !== null) return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, sweep]);

  const track = { height: 4, borderRadius: 2, backgroundColor: theme.accentContainer, overflow: "hidden" as const };
  const bar = { position: "absolute" as const, top: 0, bottom: 0, borderRadius: 2, backgroundColor: theme.accent };
  return (
    <View
      style={track}
      accessibilityRole="progressbar"
      accessibilityValue={value === null ? undefined : { min: 0, max: 100, now: Math.round(value * 100) }}
    >
      {value === null ? (
        <Animated.View
          style={[bar, { width: "40%", left: sweep.interpolate({ inputRange: [0, 1], outputRange: ["-40%", "100%"] }) }]}
        />
      ) : (
        <Animated.View style={[bar, { left: 0, width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
      )}
    </View>
  );
}

type Phase = "available" | "downloading" | "ready" | "failed" | null;

/**
 * Default prompt: a Material 3 dialog flow.
 *  1. "Update available" with the release notes → Update / Not now
 *  2. "Downloading update" with a progress bar (mandatory updates cannot be hidden)
 *  3. "Update ready" → Restart now / Later
 * Errors from a download the user started show a "Try again" dialog.
 */
export function UpdatePrompt({
  title,
  message,
  labels: labelOverrides,
  askBeforeDownload = true,
}: {
  /** Title of the "Update ready" dialog. */
  title?: string;
  /** Body of the dialogs; defaults to the release notes. */
  message?: string;
  labels?: Partial<UpdatePromptLabels>;
  /** Show "Update available" and wait for the user. Set false when the config uses autoDownload. */
  askBeforeDownload?: boolean;
}) {
  const { status, available, pendingReleaseId, currentReleaseId, downloadProgress, install, restart, busy, actionError, theme } = useFireOTA();
  const [dismissedAvailable, setDismissedAvailable] = useState<string | null>(null);
  const [dismissedReady, setDismissedReady] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  const [userStarted, setUserStarted] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const labels = { ...defaultPromptLabels, ...labelOverrides };

  useEffect(() => {
    if (actionError && userStarted) setFailed(actionError);
  }, [actionError, userStarted]);

  const mandatory = Boolean(available?.mandatory);
  const releaseId = available?.id ?? null;
  const downloading = status === "downloading" || status === "downloaded";
  const pending = pendingReleaseId && pendingReleaseId !== currentReleaseId ? pendingReleaseId : null;

  let phase: Phase = null;
  if (failed) phase = "failed";
  else if (
    releaseId &&
    hidden !== releaseId &&
    ((downloading && (mandatory || userStarted === releaseId)) || (busy && userStarted === releaseId && status !== "installed"))
  )
    phase = "downloading";
  else if (status === "installed" && pending && dismissedReady !== pending) phase = "ready";
  else if (
    askBeforeDownload &&
    available &&
    !mandatory &&
    !downloading &&
    status !== "installed" &&
    status !== "error" &&
    pending !== releaseId &&
    userStarted !== releaseId &&
    dismissedAvailable !== releaseId
  )
    phase = "available";

  const notes = message ?? (available?.message || available?.notes || "");
  const size = formatBytes(available?.bundle.size ?? 0);
  const startUpdate = () => {
    if (!releaseId) return;
    setFailed(null);
    setUserStarted(releaseId);
    void install();
  };

  let content: ReactNode = null;
  if (phase === "available") {
    content = (
      <>
        <Icon glyph="↓" styles={styles} />
        <Text style={styles.dialogTitle}>{labels.availableTitle}</Text>
        <Text style={styles.dialogBody}>{notes || labels.availableBody}</Text>
        {available?.version || size ? (
          <View style={styles.chips}>
            {available?.version ? <Text style={styles.chip}>v{available.version}</Text> : null}
            {size ? <Text style={styles.chip}>{size}</Text> : null}
          </View>
        ) : null}
        <View style={styles.actions}>
          <TextButton label={labels.notNow} onPress={() => setDismissedAvailable(releaseId)} styles={styles} />
          <FilledButton label={labels.update} onPress={startUpdate} styles={styles} />
        </View>
      </>
    );
  } else if (phase === "downloading") {
    const percent = downloadProgress === null ? null : Math.round(downloadProgress * 100);
    const total = available?.bundle.size ?? 0;
    content = (
      <>
        <Icon glyph="↓" styles={styles} />
        <Text style={styles.dialogTitle}>{mandatory ? labels.requiredTitle : labels.downloadingTitle}</Text>
        <Text style={styles.dialogBody}>{mandatory ? notes || labels.downloadingBody : labels.downloadingBody}</Text>
        <View style={styles.progressBlock}>
          <ProgressBar value={status === "downloaded" ? 1 : downloadProgress} theme={theme} />
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {percent === null
                ? status === "downloaded"
                  ? "Verifying…"
                  : "Downloading…"
                : total > 0
                  ? `${formatBytes((total * percent) / 100) || "0 KB"} of ${formatBytes(total)}`
                  : "Downloading…"}
            </Text>
            {percent !== null ? <Text style={styles.progressText}>{percent}%</Text> : null}
          </View>
        </View>
        {!mandatory ? (
          <View style={styles.actions}>
            <TextButton label={labels.hide} onPress={() => setHidden(releaseId)} styles={styles} />
          </View>
        ) : null}
      </>
    );
  } else if (phase === "ready") {
    content = (
      <>
        <Icon glyph="✓" styles={styles} />
        <Text style={styles.dialogTitle}>{title ?? labels.readyTitle}</Text>
        <Text style={styles.dialogBody}>{notes || labels.readyBody}</Text>
        <View style={styles.actions}>
          {!mandatory ? <TextButton label={labels.later} onPress={() => setDismissedReady(pending)} styles={styles} /> : null}
          <FilledButton label={labels.restart} onPress={() => void restart()} disabled={busy} styles={styles} />
        </View>
      </>
    );
  } else if (phase === "failed") {
    content = (
      <>
        <Icon glyph="!" styles={styles} danger />
        <Text style={styles.dialogTitle}>{labels.failedTitle}</Text>
        <Text style={styles.dialogBody}>{failed}</Text>
        <View style={styles.actions}>
          <TextButton
            label={labels.close}
            onPress={() => {
              setFailed(null);
              setUserStarted(null);
              setDismissedAvailable(releaseId);
            }}
            styles={styles}
          />
          <FilledButton label={labels.retry} onPress={startUpdate} styles={styles} />
        </View>
      </>
    );
  }

  const dismissible = phase === "available" || phase === "failed" || (phase === "downloading" && !mandatory);
  return (
    <Modal
      visible={phase !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Android back button: close optional dialogs only.
        if (!dismissible) return;
        if (phase === "available") setDismissedAvailable(releaseId);
        else if (phase === "downloading") setHidden(releaseId);
        else setFailed(null);
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog} accessibilityViewIsModal>
          {content}
        </View>
      </View>
    </Modal>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Icon({ glyph, styles, danger }: { glyph: string; styles: Styles; danger?: boolean }) {
  return (
    <View style={[styles.icon, danger ? styles.iconDanger : null]}>
      <Text style={[styles.iconGlyph, danger ? styles.iconGlyphDanger : null]}>{glyph}</Text>
    </View>
  );
}

function FilledButton({ label, onPress, disabled, styles }: { label: string; onPress: () => void; disabled?: boolean; styles: Styles }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.filled, (pressed || disabled) && { opacity: 0.8 }]}
    >
      <Text style={styles.filledText}>{label}</Text>
    </Pressable>
  );
}

function TextButton({ label, onPress, styles }: { label: string; onPress: () => void; styles: Styles }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}>
      <Text style={styles.textButtonText}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const STATUS_TEXT: Record<string, string> = {
  idle: "Not checked yet",
  checking: "Checking…",
  upToDate: "Up to date",
  downloading: "Downloading…",
  downloaded: "Downloaded",
  installed: "Ready — restart to apply",
  error: "Something went wrong",
};

/** A complete "App updates" screen: drop it into your settings navigator. */
export function UpdateScreen({ title = "App updates", footer }: { title?: string; footer?: ReactNode }) {
  const state = useFireOTA();
  const styles = useMemo(() => makeStyles(state.theme), [state.theme]);
  const pending = Boolean(state.pendingReleaseId && state.pendingReleaseId !== state.currentReleaseId);
  const lastChecked = state.lastCheckedAt ? new Date(state.lastCheckedAt).toLocaleString() : "never";
  const error = state.actionError ?? state.error;
  const downloading = state.status === "downloading" || state.status === "downloaded";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.heading}>{title}</Text>
      <View style={styles.card}>
        <Row styles={styles} label="App version" value={state.appVersion || "—"} />
        <Row styles={styles} label="Runtime" value={state.runtimeVersion || "—"} />
        <Row styles={styles} label="Channel" value={state.channel} />
        <Row styles={styles} label="Running" value={state.currentReleaseId ? `update ${state.currentReleaseId.slice(0, 8)}` : "store build"} />
        <Row styles={styles} label="Status" value={STATUS_TEXT[state.status] ?? state.status} />
        <Row styles={styles} label="Last checked" value={lastChecked} />
      </View>

      {state.available && !pending ? (
        <View style={styles.card}>
          <Text style={styles.title}>Update available{state.available.mandatory ? " (required)" : ""}</Text>
          <Text style={styles.body}>{state.available.message || state.available.notes || "Improvements and fixes."}</Text>
          <Text style={styles.meta}>
            update {state.available.id.slice(0, 8)}
            {state.available.bundle.size ? ` · ${formatBytes(state.available.bundle.size)}` : ""}
          </Text>
          {downloading ? (
            <View style={{ marginTop: 12 }}>
              <ProgressBar value={state.status === "downloaded" ? 1 : state.downloadProgress} theme={state.theme} />
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {pending ? (
        <Pressable accessibilityRole="button" onPress={() => void state.restart()} disabled={state.busy} style={styles.primaryWide}>
          <Text style={styles.filledText}>Restart to apply the update</Text>
        </Pressable>
      ) : state.available ? (
        <Pressable accessibilityRole="button" onPress={() => void state.install()} disabled={state.busy || downloading} style={styles.primaryWide}>
          {state.busy || downloading ? <ActivityIndicator color={state.theme.onAccent} /> : <Text style={styles.filledText}>Download update</Text>}
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => void state.check()}
          disabled={state.busy || state.status === "checking"}
          style={styles.primaryWide}
        >
          {state.busy || state.status === "checking" ? (
            <ActivityIndicator color={state.theme.onAccent} />
          ) : (
            <Text style={styles.filledText}>Check for updates</Text>
          )}
        </Pressable>
      )}
      {footer}
    </ScrollView>
  );
}

/** Wraps a root component in <FireOTAProvider>. `npx fireota init` adds this to index.js. */
export function withFireOTA<P extends object>(
  App: ComponentType<P>,
  config: FireOTAConfig,
  options: { prompt?: boolean; theme?: Partial<FireOTATheme>; colorScheme?: FireOTAColorScheme } = {},
): ComponentType<P> {
  function WithFireOTA(props: P) {
    return (
      <FireOTAProvider
        config={config}
        {...(options.prompt !== undefined ? { prompt: options.prompt } : {})}
        {...(options.theme ? { theme: options.theme } : {})}
        {...(options.colorScheme ? { colorScheme: options.colorScheme } : {})}
      >
        <App {...props} />
      </FireOTAProvider>
    );
  }
  WithFireOTA.displayName = `withFireOTA(${App.displayName ?? App.name ?? "App"})`;
  return WithFireOTA;
}

function makeStyles(t: FireOTATheme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: t.scrim, alignItems: "center", justifyContent: "center", padding: 24 },
    dialog: {
      width: "100%",

      maxWidth: 400,
      backgroundColor: t.card,
      borderRadius: 28,
      padding: 24,
      alignItems: "center",
      elevation: 6,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    icon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: t.accentContainer,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    iconDanger: { backgroundColor: "transparent", borderWidth: 2, borderColor: t.danger },
    iconGlyph: { color: t.accent, fontSize: 24, fontWeight: "700" },
    iconGlyphDanger: { color: t.danger },
    dialogTitle: { color: t.text, fontSize: 24, lineHeight: 32, fontWeight: "400", textAlign: "center", marginBottom: 16 },
    dialogBody: { color: t.muted, fontSize: 14, lineHeight: 20, letterSpacing: 0.25, alignSelf: "stretch" },
    chips: { flexDirection: "row", gap: 8, alignSelf: "stretch", marginTop: 16 },
    chip: {
      color: t.muted,
      fontSize: 12,
      fontWeight: "500",
      borderWidth: 1,
      borderColor: t.accentContainer,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      overflow: "hidden",
    },
    progressBlock: { alignSelf: "stretch", marginTop: 20, gap: 8 },
    progressRow: { flexDirection: "row", justifyContent: "space-between" },
    progressText: { color: t.muted, fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] },
    actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, alignSelf: "stretch", marginTop: 24 },
    filled: { backgroundColor: t.accent, borderRadius: 20, height: 40, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
    filledText: { color: t.onAccent, fontWeight: "500", fontSize: 14, letterSpacing: 0.1 },
    textButton: { borderRadius: 20, height: 40, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
    textButtonPressed: { backgroundColor: t.accentContainer },
    textButtonText: { color: t.accent, fontWeight: "500", fontSize: 14, letterSpacing: 0.1 },
    title: { color: t.text, fontSize: 16, fontWeight: "500" },
    body: { color: t.muted, fontSize: 14, marginTop: 4 },
    meta: { color: t.muted, fontSize: 11, marginTop: 8, fontFamily: "monospace" },
    primaryWide: { backgroundColor: t.accent, borderRadius: 20, height: 48, alignItems: "center", justifyContent: "center" },
    screen: { flex: 1, backgroundColor: t.background },
    heading: { color: t.text, fontSize: 28, fontWeight: "400", marginBottom: 4 },
    card: { backgroundColor: t.card, borderRadius: 16, padding: 16, gap: 2 },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, gap: 12 },
    rowLabel: { color: t.muted, fontSize: 14 },
    rowValue: { color: t.text, fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right" },
    error: { color: t.danger, fontSize: 13 },
  });
}
