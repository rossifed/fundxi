// PlayerAvatar — the SINGLE place that decides "player photo vs fallback"
// (RN port of apps/web/src/ui/components/PlayerAvatar.tsx). No surface
// re-implements the present/absent/broken check (SOLID/DRY): missing OR
// failed photo renders an empty silhouette, tracked per src so it auto-resets
// across players. A caller may inject a different `fallback`.

import { type ReactNode, useState } from "react";
import { Image, type ImageStyle, type StyleProp, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

interface PlayerAvatarProps {
  image_path: string | null | undefined;
  size?: number;
  radius?: number;
  fit?: "cover" | "contain";
  style?: StyleProp<ImageStyle>;
  /** Replace the default empty-silhouette fallback (e.g. a jersey chip). */
  fallback?: ReactNode;
  /** Accepted for back-compat / custom fallbacks; the silhouette ignores them. */
  jersey_number?: number;
  team_color?: string;
}

/** Neutral "no photo" placeholder: a muted person glyph on a subtle surface. */
function Silhouette({ size, radius, style }: { size: number; radius: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: "rgba(255,255,255,0.05)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24">
        <Path
          d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.8c-4.4 0-8 2.4-8 5.6V21h16v-1.6c0-3.2-3.6-5.6-8-5.6Z"
          fill="rgba(255,255,255,0.28)"
        />
      </Svg>
    </View>
  );
}

export function PlayerAvatar({ image_path, size = 32, radius, fit = "cover", style, fallback }: PlayerAvatarProps) {
  const [failed_src, set_failed_src] = useState<string | null>(null);
  const r = radius ?? Math.round(size * 0.22);

  if (!image_path || failed_src === image_path) {
    return <>{fallback ?? <Silhouette size={size} radius={r} style={style as StyleProp<ViewStyle>} />}</>;
  }

  return (
    <Image
      source={{ uri: image_path }}
      onError={() => set_failed_src(image_path)}
      resizeMode={fit}
      style={[{ width: size, height: size, borderRadius: r, backgroundColor: "rgba(255,255,255,0.05)" }, style]}
    />
  );
}
