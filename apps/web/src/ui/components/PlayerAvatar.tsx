// PlayerAvatar — a player's photo with a graceful fallback.
//
// When the provider photo is absent OR fails to load (404 / network), we fall
// back to the PlayerChip (jersey number on the team color) instead of showing
// a broken-image icon. The failure is tracked PER src, so reusing the same
// instance for another player (e.g. navigating the PlayerSheet) auto-resets.
//
// Single source for "player photo with fallback" — used everywhere a face is
// shown (web/mobile parity: see apps/mobile/components/PlayerAvatar.tsx).

import { type CSSProperties, useState } from "react";
import { PlayerChip } from "./PlayerChip";

interface PlayerAvatarProps {
  image_path: string | null | undefined;
  jersey_number: number;
  team_color: string;
  size?: number;
  /** Corner radius in px. Defaults to the PlayerChip's rounded-square radius. */
  radius?: number;
  fit?: "cover" | "contain";
  alt?: string;
  /** Extra styles merged onto the <img> (border, background overrides, …). */
  style?: CSSProperties;
}

export function PlayerAvatar({
  image_path,
  jersey_number,
  team_color,
  size = 32,
  radius,
  fit = "cover",
  alt,
  style,
}: PlayerAvatarProps) {
  // Tie the failure to the specific src: when image_path changes, the photo is
  // retried automatically (no stale "failed" carried across players).
  const [failed_src, set_failed_src] = useState<string | null>(null);

  if (!image_path || failed_src === image_path) {
    return <PlayerChip jersey_number={jersey_number} team_color={team_color} size={size} />;
  }

  return (
    <img
      src={image_path}
      alt={alt}
      onError={() => set_failed_src(image_path)}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius ?? Math.round(size * 0.22),
        objectFit: fit,
        background: "rgba(255,255,255,.05)",
        border: "1px solid rgba(255,255,255,.08)",
        ...style,
      }}
    />
  );
}
