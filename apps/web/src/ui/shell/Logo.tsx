// Logo — fundXI brand wordmark. Single source for the logo across the web app
// (header, loading gate, Home hero), mirroring apps/mobile/components/Logo.tsx
// so the two surfaces show the IDENTICAL brand art — the real wordmark
// (white "Fund" + the custom blue "XI"), extracted to transparency from the
// official logo. NOT a font re-creation. The "EVERY TOUCH HAS A PRICE" slogan
// is rendered as text beneath so it stays crisp at any size.
//
// DDD role: presentational UI component — no data, no I/O.

import type { CSSProperties } from "react";

// Served from apps/web/public/logo-wordmark.png (same asset as mobile).
const WORDMARK_SRC = "/logo-wordmark.png";
const WORDMARK_AR = "1037 / 221";

interface LogoProps {
  /** Wordmark height in px (the slogan scales from it). */
  size?: number;
  /** Render the "every touch has a price" slogan beneath the wordmark. */
  tagline?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}

export function Logo({ size = 40, tagline = false, style, onClick }: LogoProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      <img
        src={WORDMARK_SRC}
        alt="fundXI"
        style={{ height: size, aspectRatio: WORDMARK_AR, objectFit: "contain" }}
      />
      {tagline && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: size * 0.34 }}>
          <div style={{ height: 1, width: 26, background: "rgba(255,255,255,.18)" }} />
          <span
            style={{
              fontSize: Math.max(9, Math.round(size * 0.24)),
              fontWeight: 700,
              color: "rgba(255,255,255,.5)",
              letterSpacing: 2.5,
              textTransform: "uppercase",
            }}
          >
            Every touch has a price
          </span>
          <div style={{ height: 1, width: 26, background: "rgba(255,255,255,.18)" }} />
        </div>
      )}
    </div>
  );
}
