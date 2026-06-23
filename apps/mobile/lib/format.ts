// Formatting helpers — RN counterpart of apps/web/src/ui/helpers/format.ts.
// Numeric formatters are identical; `color_for_sign` returns a palette hex
// (not a CSS var) since RN consumes colours directly.

import { palette } from "@/theme/tokens";

export const price_label = (value: number): string => (value >= 999 ? "∞" : "€" + value + "M");

export const fmt_eur_m = (value_m: number): string => `€${value_m.toFixed(1)}M`;

/** A value that rounds to flat renders a neutral "€0.0M" (no sign), so it never
 * shows "€-0.0M" against the positive colour color_for_sign assigns it. */
export const fmt_eur_m_signed = (value_m: number): string => {
  const rounded = Number(value_m.toFixed(1));
  if (rounded === 0) return fmt_eur_m(0);
  return `${rounded > 0 ? "+" : ""}${fmt_eur_m(value_m)}`;
};

/** Format a €M value as plain euros (×1,000,000) — for per-share prices, which
 * are tiny in €M (e.g. €0.0000008M = €0.80) and read better in €. */
export const fmt_eur_from_m = (value_m: number): string =>
  `€${(value_m * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Share count. Whole shares show with thousands separators (counts run large
 * under the shares-per-player denomination); sub-shares show 2 decimals. */
export const fmt_shares = (n: number): string => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2));

/** A value that rounds to flat renders a neutral "0.0%" (no sign) — never the
 * confusing "-0.0%"; real moves keep their +/- sign. Mirrors
 * apps/web/src/ui/helpers/format.ts. */
export const fmt_signed_pct = (v: number | null | undefined, decimals = 1): string => {
  if (v == null) return "—";
  const rounded = Number(v.toFixed(decimals));
  if (rounded === 0) return `${(0).toFixed(decimals)}%`;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(decimals)}%`;
};

/** Sign-based colour: positive / negative / muted-neutral when null. Colours by
 * the value AS DISPLAYED at 1 dp, so a near-flat value that renders "0.0" never
 * shows red — text and colour always agree. Mirrors the web helper. */
export const color_for_sign = (v: number | null | undefined, decimals = 1): string => {
  if (v == null) return "rgba(255,255,255,0.3)";
  return Number(v.toFixed(decimals)) >= 0 ? palette.positive : palette.negative;
};
