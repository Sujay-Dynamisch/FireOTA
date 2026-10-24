// src/RequiredUpdateScreen.tsx — full-screen notice while a mandatory update installs.
// The user cannot dismiss it: FireOTA restarts the app as soon as the download is verified.
import React from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { FireOTAContextValue } from "@fireota/react-native";

export function isRequiredUpdate(ota: FireOTAContextValue) {
  return Boolean(ota.available?.mandatory) && (ota.status === "downloading" || ota.status === "downloaded");
}

export function RequiredUpdateScreen({ ota }: { ota: FireOTAContextValue }) {
  const { theme, available } = ota;
  const failed = Boolean(ota.actionError ?? ota.error);

  return (
    // onRequestClose does nothing on purpose: Android's back button must not skip a required update.
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={[styles.badge, { backgroundColor: theme.card }]}>
          <Text style={[styles.badgeText, { color: theme.accent }]}>REQUIRED UPDATE</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Updating your app</Text>
        <Text style={[styles.body, { color: theme.muted }]}>
          {available?.message || available?.notes || "An important update is being installed. This only takes a moment."}
        </Text>

        {failed ? (
          <>
            <Text style={[styles.error, { color: theme.danger }]}>The update could not be downloaded. Check your connection.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void ota.install()}
              disabled={ota.busy}
              style={[styles.button, { backgroundColor: theme.accent }]}
            >
              <Text style={styles.buttonText}>{ota.busy ? "Retrying…" : "Try again"}</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.progress}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={[styles.hint, { color: theme.muted }]}>
              {ota.status === "downloaded" ? "Restarting…" : "Downloading…"}
            </Text>
          </View>
        )}

        {available?.version ? (
          <Text style={[styles.meta, { color: theme.muted }]}>Version {available.version}</Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 320 },
  progress: { alignItems: "center", gap: 10, marginTop: 16 },
  hint: { fontSize: 13 },
  error: { fontSize: 13, textAlign: "center", marginTop: 12 },
  button: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13, marginTop: 4 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  meta: { position: "absolute", bottom: 40, fontSize: 12, fontFamily: "monospace" },
});
