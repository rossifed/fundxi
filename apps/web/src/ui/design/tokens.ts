/* Design tokens — TS side.
 *
 * Each token is a CSS ``var(--…)`` reference defined in ``theme.css``.
 * Components consume them through this module so the inline ``style={…}``
 * prop never holds a literal hex; themes are switched purely via CSS.
 *
 * Usage:
 *   import { color } from "@/ui/design/tokens";
 *   <span style={{ color: color.positive }}>…</span>
 *
 * If you need a NEW color, define it in ``theme.css`` first, then add the
 * matching entry here. Don't hardcode a hex in a component.
 */

import type { Position } from "@fundxi/core/domain/player/player";

export const color = {
  /* Brand actions */
  actionBuy: "var(--color-action-buy)",
  actionSell: "var(--color-action-sell)",
  /* Semantic */
  positive: "var(--color-positive)",
  negative: "var(--color-negative)",
  /* Discipline */
  cardYellow: "var(--color-card-yellow)",
  /* Charts */
  chartPrimary: "var(--color-chart-primary)",
  chartNegative: "var(--color-chart-negative)",
  /* Accents */
  accent: "var(--color-accent)",
  brandGreen: "var(--color-brand-green)",
  /* Surfaces */
  bg: "var(--color-bg)",
  tooltipBg: "var(--color-tooltip-bg)",
  surfaceDeep: "var(--color-surface-deep)",
  surfaceDeeper: "var(--color-surface-deeper)",
} as const;

export const ambient_gradient =
  "radial-gradient(ellipse 85% 60% at 100% 0%, var(--color-grad-1) 0%, var(--color-grad-2) 25%, var(--color-grad-3) 65%, var(--color-grad-4) 100%)";

// Position UI tokens (presentation only — domain stays in @/domain/player/player.ts)
export const position_color: Record<Position, string> = {
  FW: "rgba(255,255,255,.45)",
  MF: "rgba(255,255,255,.45)",
  DF: "rgba(255,255,255,.45)",
  GK: "rgba(255,255,255,.45)",
};

// Back-compat: the previous ``colors`` shape some legacy callers may use.
// Prefer the ``color`` export above for new code.
export const colors = {
  background: color.bg,
  green: color.positive,
  green_soft: color.positive,
  red: color.negative,
  white: "#fff",
  text: {
    primary: "#fff",
    secondary: "rgba(255,255,255,.5)",
    tertiary: "rgba(255,255,255,.35)",
    muted: "rgba(255,255,255,.25)",
    faint: "rgba(255,255,255,.15)",
  },
  surface: {
    card: "rgba(255,255,255,.03)",
    card_soft: "rgba(255,255,255,.025)",
    active: "rgba(255,255,255,.06)",
  },
  border: "rgba(255,255,255,.04)",
} as const;
