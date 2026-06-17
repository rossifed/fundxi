// LIVE pill — mirrors apps/web/src/ui/components/LiveBadge.tsx.
// Pulsing dot + "LIVE" label. The web uses a CSS keyframe; RN uses an
// Animated opacity loop on the dot.

import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { palette, with_alpha } from "@/theme/tokens";

export function LiveBadge() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={styles.badge}>
      <Animated.View style={[styles.dot, { opacity }]} />
      <Text style={styles.label}>LIVE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Green (positive) — the single canonical "LIVE" colour, same as web.
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: with_alpha(palette.positive, 0.16),
    borderWidth: 1,
    borderColor: with_alpha(palette.positive, 0.45),
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.positive },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: palette.positive },
});
