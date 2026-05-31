// Global connection banner — mirrors the web connection-status hint. A thin
// strip that drops in only when the live SSE stream is offline, so users see
// "live offline" rather than silently stale data. Reuses the shared stream
// status (one socket, fanned out) from components/live.

import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useStreamStatus } from "@/components/live";
import { palette } from "@/theme/tokens";

export function OfflineBanner() {
  const status = useStreamStatus();
  const insets = useSafeAreaInsets();
  if (status !== "offline") return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4 }]} pointerEvents="none">
      <View style={styles.dot} />
      <Text style={styles.label}>Live updates offline — reconnecting…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingBottom: 5,
    backgroundColor: palette.negative,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  label: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
});
