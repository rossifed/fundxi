// PlayerAvatar — a player's photo with a graceful fallback (RN port of
// apps/web/src/ui/components/PlayerAvatar.tsx).
//
// When the provider photo is absent OR fails to load, fall back to the
// PlayerChip (jersey number on the team color) instead of an empty box. The
// failure is tracked per src, so reusing the instance for another player
// auto-resets.

import { useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";

import { PlayerChip } from "@/components/PlayerChip";

interface PlayerAvatarProps {
  image_path: string | null | undefined;
  jersey_number: number;
  team_color: string;
  size?: number;
  radius?: number;
  fit?: "cover" | "contain";
  style?: StyleProp<ImageStyle>;
}

export function PlayerAvatar({
  image_path,
  jersey_number,
  team_color,
  size = 32,
  radius,
  fit = "cover",
  style,
}: PlayerAvatarProps) {
  const [failed_src, set_failed_src] = useState<string | null>(null);

  if (!image_path || failed_src === image_path) {
    return <PlayerChip jersey_number={jersey_number} team_color={team_color} size={size} />;
  }

  return (
    <Image
      source={{ uri: image_path }}
      onError={() => set_failed_src(image_path)}
      resizeMode={fit}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius ?? Math.round(size * 0.22),
          backgroundColor: "rgba(255,255,255,0.05)",
        },
        style,
      ]}
    />
  );
}
