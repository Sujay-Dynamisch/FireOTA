// src/UpdateDialog.tsx — a centered "What's new" dialog once an update is downloaded.
// Use it as renderPrompt: <FireOTAProvider renderPrompt={(ota) => <UpdateDialog ota={ota} />} …>
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { FireOTAContextValue } from "@fireota/react-native";

import { RequiredUpdateScreen, isRequiredUpdate } from "./RequiredUpdateScreen";

export function UpdateDialog({ ota }: { ota: FireOTAContextValue }) {
  // "Not now" hides the dialog for this update only; it still applies on the next cold start.
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
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: theme.card }]}>
          <View style={[styles.icon, { backgroundColor: theme.accent }]}>
            <Text style={styles.iconText}>↑</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>What's new</Text>
          {available?.version ? (
            <Text style={[styles.version, { color: theme.muted }]}>Version {available.version}</Text>
          ) : null}

          <View style={styles.notes}>
            {notes.slice(0, 6).map((line, i) => (
              <Text key={i} style={[styles.note, { color: theme.text }]}>
                •  {line}
              </Text>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void ota.restart()}
            disabled={ota.busy}
            style={[styles.primary, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.primaryText}>Restart now</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: theme.muted }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "rgba(0,0,0,0.55)" },
  dialog: { width: "100%", maxWidth: 340, borderRadius: 20, padding: 22, alignItems: "center", gap: 4 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  iconText: { color: "#fff", fontSize: 22, fontWeight: "800" },
  title: { fontSize: 19, fontWeight: "800" },
  version: { fontSize: 12, fontFamily: "monospace" },
  notes: { alignSelf: "stretch", gap: 6, marginTop: 14, marginBottom: 18 },
  note: { fontSize: 14, lineHeight: 20 },
  primary: { alignSelf: "stretch", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondary: { paddingVertical: 11 },
  secondaryText: { fontSize: 14, fontWeight: "600" },
});
