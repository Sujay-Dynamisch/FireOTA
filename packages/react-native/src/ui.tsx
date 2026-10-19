/**
 * Ready-made UI for FireOTA. Works out of the box; every piece can be restyled or replaced.
 *
 *   <FireOTAProvider config={fireotaConfig}>   configures the SDK and shows <UpdatePrompt />
 *   useFireOTA()                                state + actions for your own UI
 *   <UpdateScreen />                            a complete "App updates" settings screen
 *   withFireOTA(App, fireotaConfig)             one-line wrapper used by `npx fireota init`
 */
import React, { createContext, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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
  accent: string;
  background: string;
  card: string;
  text: string;
  muted: string;
  danger: string;
}

export const defaultTheme: FireOTATheme = {
  accent: "#FF5A1F",
  background: "#0E1013",
  card: "#171A1F",
  text: "#F4F5F7",
  muted: "#9AA1AC",
  danger: "#F05252",
};

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

/**
 * Configures FireOTA once and provides update state to the app. Renders the built-in
 * <UpdatePrompt /> unless `prompt={false}` or a custom `renderPrompt` is given.
 */
export function FireOTAProvider({
  config,
  children,
  prompt = true,
  renderPrompt,
  theme,
}: {
  config: FireOTAConfig;
  children: ReactNode;
  prompt?: boolean;
  renderPrompt?: (value: FireOTAContextValue) => ReactNode;
  theme?: Partial<FireOTATheme>;
}) {
  const snapshot = useSnapshot();
  const actions = useActions(snapshot);
  const merged = useMemo(() => ({ ...defaultTheme, ...theme }), [theme]);

  useEffect(() => {
    // Never let update plumbing crash the app: the bundle it shipped with keeps running.
    configure(config).catch((error: unknown) => console.warn("[FireOTA]", error instanceof Error ? error.message : error));
    // Configure once per app launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: FireOTAContextValue = { ...snapshot, ...actions, theme: merged };
  return (
    <Context.Provider value={value}>
      {children}
      {renderPrompt ? renderPrompt(value) : prompt ? <UpdatePrompt /> : null}
    </Context.Provider>
  );
}

/** Update state and actions. Works inside <FireOTAProvider>, or on its own after configure(). */
export function useFireOTA(): FireOTAContextValue {
  const context = useContext(Context);
  const snapshot = useSnapshot();
  const actions = useActions(snapshot);
  return context ?? { ...snapshot, ...actions, theme: defaultTheme };
}

/**
 * Default prompt: a full-screen notice while a mandatory update installs, and a
 * "Restart to update" card once a normal update is downloaded.
 */
export function UpdatePrompt({ title = "Update ready", message }: { title?: string; message?: string }) {
  const { status, available, pendingReleaseId, currentReleaseId, restart, busy, theme } = useFireOTA();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const mandatoryInProgress = Boolean(available?.mandatory) && (status === "downloading" || status === "downloaded");
  const ready = status === "installed" && pendingReleaseId && pendingReleaseId !== currentReleaseId && dismissed !== pendingReleaseId;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (mandatoryInProgress) {
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={styles.title}>Installing an important update</Text>
            <Text style={styles.body}>{available?.message || available?.notes || "This only takes a moment."}</Text>
          </View>
        </View>
      </Modal>
    );
  }
  if (!ready) return null;
  return (
    <View pointerEvents="box-none" style={styles.bannerWrap}>
      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body} numberOfLines={2}>
            {message ?? (available?.message || available?.notes || "A new version is ready. Restart to use it.")}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setDismissed(pendingReleaseId)} style={styles.secondary}>
          <Text style={styles.secondaryText}>Later</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void restart()} disabled={busy} style={styles.primary}>
          <Text style={styles.primaryText}>Restart</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
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
          <Text style={styles.meta}>update {state.available.id.slice(0, 8)}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {pending ? (
        <Pressable accessibilityRole="button" onPress={() => void state.restart()} disabled={state.busy} style={styles.primaryWide}>
          <Text style={styles.primaryText}>Restart to apply the update</Text>
        </Pressable>
      ) : state.available ? (
        <Pressable accessibilityRole="button" onPress={() => void state.install()} disabled={state.busy} style={styles.primaryWide}>
          {state.busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Download update</Text>}
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => void state.check()}
          disabled={state.busy || state.status === "checking"}
          style={styles.primaryWide}
        >
          {state.busy || state.status === "checking" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Check for updates</Text>
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
  options: { prompt?: boolean; theme?: Partial<FireOTATheme> } = {},
): ComponentType<P> {
  function WithFireOTA(props: P) {
    return (
      <FireOTAProvider config={config} {...(options.prompt !== undefined ? { prompt: options.prompt } : {})} {...(options.theme ? { theme: options.theme } : {})}>
        <App {...props} />
      </FireOTAProvider>
    );
  }
  WithFireOTA.displayName = `withFireOTA(${App.displayName ?? App.name ?? "App"})`;
  return WithFireOTA;
}

function makeStyles(t: FireOTATheme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
    dialog: { width: "100%", maxWidth: 360, backgroundColor: t.card, borderRadius: 16, padding: 24, alignItems: "center", gap: 12 },
    bannerWrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12 },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: t.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
      elevation: 6,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    title: { color: t.text, fontSize: 15, fontWeight: "700" },
    body: { color: t.muted, fontSize: 13, marginTop: 2 },
    meta: { color: t.muted, fontSize: 11, marginTop: 6, fontFamily: "monospace" },
    primary: { backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    primaryWide: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    secondary: { paddingHorizontal: 10, paddingVertical: 9 },
    secondaryText: { color: t.muted, fontWeight: "600", fontSize: 14 },
    screen: { flex: 1, backgroundColor: t.background },
    heading: { color: t.text, fontSize: 24, fontWeight: "800", marginBottom: 4 },
    card: { backgroundColor: t.card, borderRadius: 14, padding: 14, gap: 2 },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, gap: 12 },
    rowLabel: { color: t.muted, fontSize: 14 },
    rowValue: { color: t.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
    error: { color: t.danger, fontSize: 13 },
  });
}
