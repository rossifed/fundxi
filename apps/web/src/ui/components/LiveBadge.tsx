/* LiveBadge — "a match is LIVE right now" marker.
 *
 * Deliberately BLUE (accent), not the connection-status green: a live
 * fixture and the SSE connection indicator are two different things and
 * must not look alike. Glowing, pulsing dot so it reads as on-air. */
export function LiveBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: "var(--color-accent-blue-soft)",
        border: "1px solid color-mix(in srgb, var(--color-accent-blue) 45%, transparent)",
        padding: "6px 11px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.4,
        color: "var(--color-accent-blue)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--color-accent-blue)",
          boxShadow: "0 0 6px var(--color-accent-blue)",
          animation: "pulse 1.5s infinite",
        }}
      />
      LIVE
    </span>
  );
}
