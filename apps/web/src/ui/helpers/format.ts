export const price_label = (value: number): string => (value >= 999 ? "∞" : "€" + value + "M");

/** Format a money amount denominated in €M with a single decimal.
 * Negative values keep their sign in the output. */
export const fmt_eur_m = (value_m: number): string => `€${value_m.toFixed(1)}M`;

/** Same as fmt_eur_m, but with a leading "+" sign for non-negative values. */
export const fmt_eur_m_signed = (value_m: number): string =>
  `${value_m >= 0 ? "+" : ""}${fmt_eur_m(value_m)}`;

/** Format a shares count with fractional precision. Whole shares show
 * with no decimal; sub-shares show 2 decimals (e.g. 0.65). */
export const fmt_shares = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2);

/** Format a signed percentage with a leading "+" / "-" and N decimals.
 * Returns "—" when the value is null/undefined (no data). */
export const fmt_signed_pct = (v: number | null | undefined, decimals = 1): string => {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
};

/** Canonical sign-based color token (positive / negative / muted-neutral
 * when null). Returns a ``var(--color-…)`` reference so the theme owns
 * the actual hue. */
export const color_for_sign = (v: number | null | undefined): string => {
  if (v == null) return "rgba(255,255,255,.3)";
  return v >= 0 ? "var(--color-positive)" : "var(--color-negative)";
};
