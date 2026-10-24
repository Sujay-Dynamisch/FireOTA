// src/UpdateSheet.tsx — a bottom sheet with the release notes once an update is downloaded.
// Use it as renderPrompt: <FireOTAProvider renderPrompt={(ota) => <UpdateSheet ota={ota} />} …>
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { FireOTAContextValue } from "@fireota/react-native";

import { RequiredUpdateScreen, isRequiredUpdate } from "./RequiredUpdateScreen";

const formatSize = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function UpdateSheet({ ota }: { ota: FireOTAContextValue }) {
  // "Later" hides the sheet for this update only; it still applies on the next cold start.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const { theme, available } = ota;

  if (isRequiredUpdate(ota)) return <RequiredUpdateScreen ota={ota} />;

  const ready =
    ota.status === "installed" &&
    ota.pendingReleaseId !== null &&
    ota.pendingReleaseId !== ota.currentReleaseId &&
    dismissed !== ota.pendingReleaseId;
  if (!ready) return null;

  const notes = (available?.notes || available?.message || "Improvements and bug fixes.")
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  const close = () => setDismissed(ota.pendingReleaseId);

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button">
        {/* Inner Pressable stops taps on the sheet from closing it. */}
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={[styles.eyebrow, { color: theme.accent }]}>NEW UPDATE</Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {available?.version ? `Version ${available.version} is ready` : "A new version is ready"}
          </Text>
          <Text style={[styles.meta, { color: theme.muted }]}>
            {available ? `${formatSize(available.bundle.size)} · downloaded` : "Downloaded"}
          </Text>

          <View style={styles.notes}>
            {notes.slice(0, 5).map((line, i) => (
              <View key={i} style={styles.noteRow}>
                <View style={[styles.dot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.noteText, { color: theme.text }]}>{line}</Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void ota.restart()}
            disabled={ota.busy}
            style={[styles.primary, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.primaryText}>Restart to update</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: theme.muted }]}>Later</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 6 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(127,127,127,0.4)", marginBottom: 10 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 20, fontWeight: "800" },
  meta: { fontSize: 12 },
  notes: { gap: 8, marginTop: 12, marginBottom: 18 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  noteText: { flex: 1, fontSize: 14, lineHeight: 20 },
  primary: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { fontSize: 14, fontWeight: "600" },
});
