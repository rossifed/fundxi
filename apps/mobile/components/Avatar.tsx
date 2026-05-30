// Deterministic identity avatar — mirrors apps/web/src/ui/components/Avatar.tsx.
// Renders the precomputed { initials, bg_color } from the pure domain service.

import { StyleSheet, Text, View } from "react-native";

import { compute_avatar } from "@fundxi/core/domain/identity/avatar";

interface AvatarProps {
  seed: string; // stable id (user_id, league_id, …) — drives the colour
  name: string; // display name — source of the initials
  size?: number;
}

export function Avatar({ seed, name, size = 32 }: AvatarProps) {
  const { initials, bg_color } = compute_avatar(seed, name);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg_color },
      ]}
    >
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.4) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontWeight: "700", letterSpacing: 0.3 },
});
