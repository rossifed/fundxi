// Position pill — mirrors apps/web/src/ui/components/PositionBadge.tsx.
// Faint grey chip with the position label; same neutral tone for every
// position (position_color is uniform grey by design).

import { StyleSheet, Text, View } from "react-native";

import type { Position } from "@fundxi/core/domain/player/player";
import { POSITION_ABBR, POSITION_LABEL } from "@fundxi/core/domain/player/player";
import { position_color } from "@/theme/tokens";

export function PositionBadge({ position, abbr = false }: { position: Position; abbr?: boolean }) {
  return (
    <View style={styles.badge}>
      <Text style={[styles.label, { color: position_color[position] }]}>
        {abbr ? POSITION_ABBR[position] : POSITION_LABEL[position]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
});
