export const price_label = (value: number): string => (value >= 999 ? "∞" : "€" + value + "M");

/** Format a money amount denominated in €M with a single decimal.
 * Negative values keep their sign in the output. */
export const fmt_eur_m = (value_m: number): string => `€${value_m.toFixed(1)}M`;

/** Same as fmt_eur_m, but with a leading "+" sign for non-negative values. */
export const fmt_eur_m_signed = (value_m: number): string =>
  `${value_m >= 0 ? "+" : ""}${fmt_eur_m(value_m)}`;

/** Format a €M value as plain euros (×1,000,000). Used for per-share prices,
 * which are tiny in €M (e.g. €0.0000008M = €0.80) and read better in €. */
export const fmt_eur_from_m = (value_m: number): string =>
  `€${(value_m * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Format a share count. Whole shares show with thousands separators (counts
 * run large under the shares-per-player denomination, e.g. 740,000); sub-shares
 * show 2 decimals (e.g. 0.65). */
export const fmt_shares = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);

/** Format a signed percentage with a leading "+" / "-" and N decimals.
 * Returns "—" when the value is null/undefined (no data). A value that rounds
 * to flat at this precision (incl. negative zero, e.g. -0.04 -> "-0.0") renders
 * as "+0.0%", never the confusing "-0.0%"; real moves keep their sign. */
export const fmt_signed_pct = (v: number | null | undefined, decimals = 1): string => {
  if (v == null) return "—";
  const rounded = Number(v.toFixed(decimals));
  const norm = rounded === 0 ? 0 : rounded;
  return `${norm >= 0 ? "+" : ""}${norm.toFixed(decimals)}%`;
};

/** Format a fixture's ISO kickoff as "11 Jun · 21:00" in the viewer's local
 * timezone. Returns "TBD" when the date is missing/invalid. The time is
 * derived from the timestamp — never hardcoded. */
export const fmt_fixture_datetime = (iso: string | undefined): string => {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
};

/** Canonical sign-based color token (positive / negative / muted-neutral
 * when null). Returns a ``var(--color-…)`` reference so the theme owns
 * the actual hue. */
export const color_for_sign = (v: number | null | undefined): string => {
  if (v == null) return "rgba(255,255,255,.3)";
  return v >= 0 ? "var(--color-positive)" : "var(--color-negative)";
};

// Live match clock. The Match maps a missing provider minute to 0, so for a
// live match a falsy minute means "no clock yet" — show "LIVE" rather than a
// misleading "0'".
export const fmt_live_minute = (minute: number | null | undefined): string =>
  minute ? `${minute}'` : "LIVE";
