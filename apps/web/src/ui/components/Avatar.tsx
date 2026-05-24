import { compute_avatar } from "@fundxi/core/domain/identity/avatar";

interface AvatarProps {
  /** Stable identifier (user_id, league_id, …). Drives the color
   * deterministically so the same entity always renders the same. */
  seed: string;
  /** Display name — the source of the initials. */
  name: string;
  size?: number;
}

export function Avatar({ seed, name, size = 32 }: AvatarProps) {
  const { initials, bg_color } = compute_avatar(seed, name);
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg_color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
        letterSpacing: 0.3,
        flexShrink: 0,
        userSelect: "none",
      }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
