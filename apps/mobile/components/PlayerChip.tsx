// Player avatar chip — mirrors apps/web/src/ui/components/PlayerChip.tsx.
// Jersey number on a team-color tinted square. No crests, no kit designs —
// jersey numbers are public facts.

import { StyleSheet, Text, View } from "react-native";

import { mono } from "@/theme/tokens";

interface PlayerChipProps {
  jersey_number: number;
  team_color: string; // hex
  size?: number;
}

// Normalize 3-digit hex ("#222") to 6-digit so 8-digit alpha concat is valid.
function expand_hex(hex: string): string {
  if (hex.length === 4 && hex.startsWith("#")) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

export function PlayerChip({ jersey_number, team_color, size = 32 }: PlayerChipProps) {
  const color = expand_hex(team_color);
  return (
    <View
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.22),
          backgroundColor: `${color}22`,
          borderColor: `${color}55`,
        },
      ]}
    >
      <Text style={[styles.num, { fontSize: Math.round(size * 0.42) }]}>{jersey_number}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  num: {
    fontFamily: mono,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
  },
});
