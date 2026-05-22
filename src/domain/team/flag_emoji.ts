/* flag_emoji — nation code → flag glyph.
 *
 * Presentational localisation ONLY. A national flag is a universal
 * representation of a nation (like its name), NOT Sportmonks data — this
 * is the "purely presentational mapping" exception in CLAUDE.md rule 2.
 * Real provider data (kit colour, continent) lives in the DB and is never
 * hardcoded here; the raster flag image stays on `Team.flag_url`.
 *
 * Keyed by the team's ISO-3 short code (`core.team.id`).
 */

const FLAG_BY_CODE: Record<string, string> = {
  ARG: "🇦🇷", AUS: "🇦🇺", AUT: "🇦🇹", BEL: "🇧🇪", BIH: "🇧🇦",
  BRA: "🇧🇷", CAN: "🇨🇦", CIV: "🇨🇮", CMR: "🇨🇲", COD: "🇨🇩",
  COL: "🇨🇴", CPV: "🇨🇻", CRI: "🇨🇷", CRO: "🇭🇷", CUW: "🇨🇼",
  CZE: "🇨🇿", DEN: "🇩🇰", DZA: "🇩🇿", ECU: "🇪🇨", EGY: "🇪🇬",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP: "🇪🇸", FRA: "🇫🇷", GER: "🇩🇪", GHA: "🇬🇭",
  HTI: "🇭🇹", IRN: "🇮🇷", IRQ: "🇮🇶", JOR: "🇯🇴", JPN: "🇯🇵",
  KOR: "🇰🇷", KSA: "🇸🇦", MAR: "🇲🇦", MEX: "🇲🇽", NED: "🇳🇱",
  NOR: "🇳🇴", NZL: "🇳🇿", PAN: "🇵🇦", POL: "🇵🇱", POR: "🇵🇹",
  PRY: "🇵🇾", QAT: "🇶🇦", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", SEN: "🇸🇳", SRB: "🇷🇸",
  SUI: "🇨🇭", SWE: "🇸🇪", TUN: "🇹🇳", TUR: "🇹🇷", URU: "🇺🇾",
  USA: "🇺🇸", UZB: "🇺🇿", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", ZAF: "🇿🇦",
};

/** Flag glyph for a team's ISO-3 short code; a white flag when unknown. */
export function flag_emoji(code: string): string {
  return FLAG_BY_CODE[code] ?? "🏳️";
}
