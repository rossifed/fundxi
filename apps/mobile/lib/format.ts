// Formatting helpers — RN counterpart of apps/web/src/ui/helpers/format.ts.
// Numeric formatters are identical; `color_for_sign` returns a palette hex
// (not a CSS var) since RN consumes colours directly.

import { palette } from "@/theme/tokens";

export const price_label = (value: number): string => (value >= 999 ? "∞" : "€" + value + "M");

export const fmt_eur_m = (value_m: number): string => `€${value_m.toFixed(1)}M`;

export const fmt_eur_m_signed = (value_m: number): string =>
  `${value_m >= 0 ? "+" : ""}${fmt_eur_m(value_m)}`;

/** Format a €M value as plain euros (×1,000,000) — for per-share prices, which
 * are tiny in €M (e.g. €0.0000008M = €0.80) and read better in €. */
export const fmt_eur_from_m = (value_m: number): string =>
  `€${(value_m * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Share count. Whole shares show with thousands separators (counts run large
 * under the shares-per-player denomination); sub-shares show 2 decimals. */
export const fmt_shares = (n: number): string => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2));

/** A value that rounds to flat at this precision (incl. negative zero, e.g.
 * -0.04 -> "-0.0") renders "+0.0%", never the confusing "-0.0%"; real moves
 * keep their sign. Mirrors apps/web/src/ui/helpers/format.ts. */
export const fmt_signed_pct = (v: number | null | undefined, decimals = 1): string => {
  if (v == null) return "—";
  const rounded = Number(v.toFixed(decimals));
  const norm = rounded === 0 ? 0 : rounded;
  return `${norm >= 0 ? "+" : ""}${norm.toFixed(decimals)}%`;
};

/** Sign-based colour: positive / negative / muted-neutral when null. */
export const color_for_sign = (v: number | null | undefined): string => {
  if (v == null) return "rgba(255,255,255,0.3)";
  return v >= 0 ? palette.positive : palette.negative;
};
