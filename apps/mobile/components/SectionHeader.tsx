// L1 widget title — mirrors apps/web/src/ui/components/SectionHeader.tsx.
// White bold 13px on a padded header bar with a bottom border. Optional
// right-side CTA (pressable) or meta (static). `live` adds a status dot,
// matching the Home Match Center header.

import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette, text } from "@/theme/tokens";

export type StreamStatus = "online" | "offline" | "unknown";

interface SectionHeaderProps {
  title: string;
  cta?: string;
  meta?: string;
  on_cta?: () => void;
  live?: StreamStatus;
}

export function SectionHeader({ title, cta, meta, on_cta, live }: SectionHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.title_row}>
        <Text style={styles.title}>{title}</Text>
        {live && <LiveDot status={live} />}
      </View>
      {cta && on_cta ? (
        <Pressable onPress={on_cta} hitSlop={8}>
          <Text style={styles.cta}>{cta}</Text>
        </Pressable>
      ) : meta ? (
        <Text style={styles.meta}>{meta}</Text>
      ) : null}
    </View>
  );
}

function LiveDot({ status }: { status: StreamStatus }) {
  const color =
    status === "online" ? palette.positive : status === "offline" ? palette.negative : text.muted;
  const label = status === "online" ? "live" : status === "offline" ? "offline" : "…";
  return (
    <View style={styles.live_row}>
      <View style={[styles.live_dot, { backgroundColor: color }]} />
      <Text style={[styles.live_label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomColor: "rgba(255,255,255,0.05)",
    borderBottomWidth: 1,
  },
  title_row: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  title: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.2, flexShrink: 1 },
  cta: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "600" },
  meta: { color: "rgba(255,255,255,0.3)", fontSize: 11 },
  live_row: { flexDirection: "row", alignItems: "center", gap: 4 },
  live_dot: { width: 6, height: 6, borderRadius: 3 },
  live_label: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
});
