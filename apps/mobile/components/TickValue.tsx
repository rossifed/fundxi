// TickValue — price-change feedback (RN port of
// apps/web/src/ui/components/TickValue.tsx). On a live tick it shows a brief
// directional caret (▲/▼) plus a subtle tinted background; one-shot, never
// looping. Formatting stays at the call site (pass formatted children); only
// the raw numeric `value` drives the flash.

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "@/theme/tokens";
import { usePulse } from "@/components/use_pulse";

interface TickValueProps {
  value: number;
  children: ReactNode;
  caret?: boolean;
}

export function TickValue({ value, children, caret = true }: TickValueProps) {
  const pulse = usePulse(value);
  const tint =
    pulse === "up"
      ? "rgba(0,128,93,0.18)"
      : pulse === "down"
        ? "rgba(228,21,65,0.18)"
        : "transparent";

  return (
    <View style={[styles.wrap, { backgroundColor: tint }]}>
      {caret && pulse && (
        <Text style={[styles.caret, { color: pulse === "up" ? palette.positive : palette.negative }]}>
          {pulse === "up" ? "▲" : "▼"}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 2,
    borderRadius: 4,
  },
  caret: { fontSize: 9, lineHeight: 12 },
});
