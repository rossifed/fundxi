// Formatting helpers — RN counterpart of apps/web/src/ui/helpers/format.ts.
// Numeric formatters are identical; `color_for_sign` returns a palette hex
// (not a CSS var) since RN consumes colours directly.

import { palette } from "@/theme/tokens";

export const price_label = (value: number): string => (value >= 999 ? "∞" : "€" + value + "M");

export const fmt_eur_m = (value_m: number): string => `€${value_m.toFixed(1)}M`;

export const fmt_eur_m_signed = (value_m: number): string =>
  `${value_m >= 0 ? "+" : ""}${fmt_eur_m(value_m)}`;

export const fmt_shares = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export const fmt_signed_pct = (v: number | null | undefined, decimals = 1): string => {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
};

/** Sign-based colour: positive / negative / muted-neutral when null. */
export const color_for_sign = (v: number | null | undefined): string => {
  if (v == null) return "rgba(255,255,255,0.3)";
  return v >= 0 ? palette.positive : palette.negative;
};
