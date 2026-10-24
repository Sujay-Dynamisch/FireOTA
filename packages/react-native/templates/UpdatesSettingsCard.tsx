// src/UpdatesSettingsCard.tsx — an "App updates" card for your Settings or About screen.
// Works anywhere under withFireOTA / FireOTAProvider: <UpdatesSettingsCard />
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFireOTA } from "@fireota/react-native";

export function UpdatesSettingsCard() {
  const ota = useFireOTA();
  const { theme, available } = ota;
  const pending = Boolean(ota.pendingReleaseId && ota.pendingReleaseId !== ota.currentReleaseId);
  const working = ota.busy || ota.status === "checking" || ota.status === "downloading";
  const error = ota.actionError ?? ota.error;

  const status = pending
    ? "Update downloaded — restart to apply"
    : available
      ? `Update available${available.version ? `: ${available.version}` : ""}`
      : ota.status === "upToDate"
        ? "You're on the latest version"
        : ota.status === "checking"
          ? "Checking for updates…"
          : "Not checked yet";

  // One button that always does the next sensible step.
  const action = pending
    ? { label: "Restart now", run: ota.restart }
    : available
      ? { label: "Download update", run: ota.install }
      : { label: "Check for updates", run: ota.check };

  const lastChecked = ota.lastCheckedAt ? new Date(ota.lastCheckedAt).toLocaleString() : "never";

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>App updates</Text>
        <View style={[styles.dot, { backgroundColor: pending || available ? theme.accent : "#22C55E" }]} />
      </View>
      <Text style={[styles.status, { color: theme.text }]}>{status}</Text>
      {available && !pending && (available.notes || available.message) ? (
        <Text style={[styles.notes, { color: theme.muted }]} numberOfLines={3}>
          {available.notes || available.message}
        </Text>
      ) : null}

      <View style={[styles.rows, { borderColor: theme.background }]}>
        <Row label="App version" value={ota.appVersion || "—"} color={theme} />
        <Row label="Channel" value={ota.channel} color={theme} />
        <Row label="Running" value={ota.currentReleaseId ? `update ${ota.currentReleaseId.slice(0, 8)}` : "store build"} color={theme} />
        <Row label="Last checked" value={lastChecked} color={theme} />
      </View>

      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => void action.run()}
        disabled={working}
        style={[styles.button, { backgroundColor: theme.accent }]}
      >
        {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{action.label}</Text>}
      </Pressable>
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: { text: string; muted: string } }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: color.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: color.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 17, fontWeight: "800" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontSize: 14, fontWeight: "600" },
  notes: { fontSize: 13, lineHeight: 18 },
  rows: { borderTopWidth: 1, marginTop: 8, paddingTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, gap: 12 },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  error: { fontSize: 13 },
  button: { borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
