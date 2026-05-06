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
