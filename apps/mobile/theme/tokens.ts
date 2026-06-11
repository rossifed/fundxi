// Mobile design tokens — RN counterpart of apps/web/src/ui/design/tokens.ts.
//
// `palette` is the theme-switchable source of truth (mirrors theme.css via
// packages/core/src/design/palette.ts). `text` / `surface` / `border` are the
// transitional white-opacity overlays — theme-agnostic on a dark UI, kept here
// so components never repeat rgba(...) literals. Same values as the web
// `colors` export.

import type { Position } from "@fundxi/core/domain/player/player";
import { themes } from "@fundxi/core/design/palette";

export const palette = themes.dark;

export const text = {
  primary: "#fff",
  secondary: "rgba(255,255,255,0.5)",
  tertiary: "rgba(255,255,255,0.35)",
  muted: "rgba(255,255,255,0.25)",
  faint: "rgba(255,255,255,0.15)",
} as const;

export const surface = {
  card: "rgba(255,255,255,0.03)",
  cardSoft: "rgba(255,255,255,0.025)",
  active: "rgba(255,255,255,0.06)",
} as const;

export const border = "rgba(255,255,255,0.05)";
export const borderSoft = "rgba(255,255,255,0.04)";

// Apply an alpha to a solid palette token. RN can't add opacity to a colour
// reference the way web does with color-mix(), so brand-tinted fills/borders
// go through this helper (e.g. with_alpha(palette.positive, 0.08)) instead of
// hardcoding rgba(...) literals — keeps every colour sourced from the palette.
export function with_alpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Type faces — embedded natively via the expo-font config plugin (app.json),
// matching the web (Inter body + JetBrains Mono numerals). Weights are real
// font files registered under one family each, so `fontWeight` selects the
// right cut. `sans` is also wired as the global Text default in _layout.tsx.
export const sans = "Inter";
export const mono = "JetBrains Mono";

// Position UI tokens (presentation only — domain stays in core player.ts).
export const position_color: Record<Position, string> = {
  FW: "rgba(255,255,255,0.45)",
  MF: "rgba(255,255,255,0.45)",
  DF: "rgba(255,255,255,0.45)",
  GK: "rgba(255,255,255,0.45)",
};
