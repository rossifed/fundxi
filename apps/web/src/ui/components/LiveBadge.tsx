/* LiveBadge — "a match is LIVE right now" marker.
 *
 * GREEN (positive): the single canonical "LIVE" colour across the app — the
 * fixture badge, the match banner, the commentary ticker and the match log all
 * read the same. Glowing, pulsing dot so it reads as on-air.
 *
 * Optional `minute` is appended as "LIVE 67'" — keeps the live clock on the
 * badge instead of crowding the flag/score block in the LiveBar. */
export function LiveBadge({ minute }: { minute?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: "color-mix(in srgb, var(--color-positive) 14%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-positive) 45%, transparent)",
        padding: "6px 11px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.4,
        color: "var(--color-positive)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--color-positive)",
          boxShadow: "0 0 6px var(--color-positive)",
          animation: "pulse 1.5s infinite",
        }}
      />
      LIVE
      {minute ? <span className="mono" style={{ fontWeight: 700 }}>{minute}</span> : null}
    </span>
  );
}
