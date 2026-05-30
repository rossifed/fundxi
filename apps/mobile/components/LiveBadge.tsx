// LIVE pill — mirrors apps/web/src/ui/components/LiveBadge.tsx.
// Pulsing dot + "LIVE" label. The web uses a CSS keyframe; RN uses an
// Animated opacity loop on the dot.

import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

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
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  label: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.5)" },
});
