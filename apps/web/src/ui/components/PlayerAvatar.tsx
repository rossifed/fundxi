// PlayerAvatar — the SINGLE place that decides "player photo vs fallback".
//
// Every surface that shows a face calls this; none of them re-implements the
// present/absent/broken check (SOLID/DRY). When the provider photo is missing
// OR fails to load (404 / network), we render an empty silhouette instead of a
// broken-image icon. The failure is tracked per src, so reusing the instance
// for another player auto-resets. A caller may inject a different `fallback`
// node (e.g. a jersey chip) without ever duplicating the decision logic.
//
// web/mobile parity: see apps/mobile/components/PlayerAvatar.tsx.

import { type CSSProperties, type ReactNode, useState } from "react";

interface PlayerAvatarProps {
  image_path: string | null | undefined;
  size?: number;
  /** Corner radius in px. Defaults to a rounded square; pass size/2 for a circle. */
  radius?: number;
  fit?: "cover" | "contain";
  alt?: string;
  /** Extra styles merged onto the <img> (border, background overrides, …). */
  style?: CSSProperties;
  /** Replace the default empty-silhouette fallback (e.g. a jersey chip). */
  fallback?: ReactNode;
  /** Accepted for back-compat / building a custom `fallback`; the default
   *  silhouette ignores them. */
  jersey_number?: number;
  team_color?: string;
}

/** Neutral "no photo" placeholder: a muted person glyph on a subtle surface. */
function Silhouette({ size, radius, style }: { size: number; radius: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius,
        background: "rgba(255,255,255,.05)",
        border: "1px solid rgba(255,255,255,.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="rgba(255,255,255,.28)" aria-hidden="true">
        <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.8c-4.4 0-8 2.4-8 5.6V21h16v-1.6c0-3.2-3.6-5.6-8-5.6Z" />
      </svg>
    </div>
  );
}

export function PlayerAvatar({ image_path, size = 32, radius, fit = "cover", alt, style, fallback }: PlayerAvatarProps) {
  // Tie the failure to the specific src: when image_path changes, the photo is
  // retried automatically (no stale "failed" carried across players).
  const [failed_src, set_failed_src] = useState<string | null>(null);
  const r = radius ?? Math.round(size * 0.22);

  if (!image_path || failed_src === image_path) {
    return <>{fallback ?? <Silhouette size={size} radius={r} style={style} />}</>;
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
        borderRadius: r,
        objectFit: fit,
        background: "rgba(255,255,255,.05)",
        border: "1px solid rgba(255,255,255,.08)",
        ...style,
      }}
    />
  );
}
