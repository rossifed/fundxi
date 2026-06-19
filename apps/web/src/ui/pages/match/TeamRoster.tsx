/* TeamRoster — single-team rich roster for the match List view.
 *
 * One team at a time, full-width cards grouped by position (XI, then a Bench
 * section). Each card is a clean "player tile": kit-coloured jersey number on
 * the left, portrait, then the identity (name + markers, exact position + match
 * rating), and on the right the live price with a subtle one-shot tick pulse +
 * the MATCH / TOTAL moves. No in-row chart — the row stays calm (matches the
 * fixture_new design). A quiet left accent marks a held position; a subtle
 * green/red heat wash scales with the this-match move. Tap opens the full
 * PlayerSheet (chart + stats + trade).
 *
 * DDD role: presentational UI. All values are real provider data (match rating,
 * universe valuation, holdings, kit colour) — nothing synthesised.
 */

import type { MatchPlayer } from "@fundxi/core/domain/match/match";
import type { Position } from "@fundxi/core/domain/player/player";
import type { SubInfo } from "@fundxi/core/domain/match/substitutions";
import { players_api } from "@fundxi/core/api/players_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { TickValue } from "@/ui/components/TickValue";
import { color } from "@/ui/design/tokens";
import { color_for_sign, fmt_eur_m, fmt_signed_pct } from "@/ui/helpers/format";
import { MatchEventBadge, SubBadge, type MatchEventCounts } from "@/ui/pages/match/event_badge";

const POSITION_GROUPS: readonly { key: Position; label: string }[] = [
  { key: "GK", label: "Goalkeeper" },
  { key: "DF", label: "Defenders" },
  { key: "MF", label: "Midfielders" },
  { key: "FW", label: "Forwards" },
];
const POSITION_FALLBACK: Record<Position, string> = {
  GK: "Goalkeeper",
  DF: "Defender",
  MF: "Midfielder",
  FW: "Forward",
};

function group_by_position(players: MatchPlayer[]): Map<Position, MatchPlayer[]> {
  const m = new Map<Position, MatchPlayer[]>();
  for (const g of POSITION_GROUPS) m.set(g.key, []);
  for (const p of players) (m.get(p.position) ?? m.set(p.position, []).get(p.position)!).push(p);
  return m;
}

/** This player's price move WITHIN THIS fixture (%) — the backend-computed
 * "perf of this match" (0 before kickoff, 0 for players who didn't feature).
 * Drives the MATCH delta and the per-position impact sort. */
function match_delta(p: MatchPlayer): number {
  return p.change_this_match ?? 0;
}

interface TeamRosterProps {
  xi: MatchPlayer[];
  bench: MatchPlayer[];
  team_color?: string;
  event_counts: Map<number, MatchEventCounts>;
  subs: Map<number, SubInfo>;
  /** Pre-lineup squad mode: render just the position sections with no "XI"
   * group header (it's the full squad, not a starting XI; bench is empty). */
  squad_mode?: boolean;
  /** Watched player ids — marks the watchlist star on each card. */
  watchlist?: Set<number>;
  on_open_player: (player_id: number) => void;
}

// Comfortable reading measure for the single-team rows (centred by the caller).
const ROSTER_MAX_WIDTH = 720;

export function TeamRoster({ xi, bench, team_color, event_counts, subs, squad_mode, watchlist, on_open_player }: TeamRosterProps) {
  const by_pos = group_by_position(xi);
  // ``match_delta`` (= change_this_match) is 0 before kickoff and for players who
  // didn't feature, so sorting/movers/heat are correct by construction — no
  // started/participation gating needed. Biggest mover of THIS match first.
  const sort_by_impact = (rows: MatchPlayer[]) =>
    rows.slice().sort((a, b) => Math.abs(match_delta(b)) - Math.abs(match_delta(a)));
  const bench_ordered = sort_by_impact(POSITION_GROUPS.flatMap(g => group_by_position(bench).get(g.key) ?? []));

  return (
    // gap 18 between the two top-level blocks (XI / Bench) so the starter↔sub
    // break reads as a real separation, not just another position group.
    <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%", maxWidth: ROSTER_MAX_WIDTH }}>
      {/* Starting XI — strong group header, then position sub-groups (faint).
          Hidden in squad mode (pre-lineup full squad, no XI/Bench split). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!squad_mode && <GroupHeader label="XI" />}
        {POSITION_GROUPS.map(g => {
          const rows = sort_by_impact(by_pos.get(g.key) ?? []);
          if (rows.length === 0) return null;
          return (
            <Section key={g.key} label={g.label}>
              {rows.map(p => (
                <RichRosterCard
                  key={p.id}
                  p={p}
                  team_color={team_color}
                  events={event_counts.get(p.id)}
                  sub_info={subs.get(p.id)}
                  watched={watchlist?.has(p.id) ?? false}
                  delta={match_delta(p)}
                  on_open={on_open_player}
                />
              ))}
            </Section>
          );
        })}
      </div>

      {/* Bench — its OWN top-level block with a strong header (the substitutes,
          clearly set apart from the XI; cards are dimmed too). */}
      {bench_ordered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <GroupHeader label="Bench" />
          {bench_ordered.map(p => (
            <RichRosterCard
              key={p.id}
              p={p}
              team_color={team_color}
              events={event_counts.get(p.id)}
              sub_info={subs.get(p.id)}
              watched={watchlist?.has(p.id) ?? false}
              delta={match_delta(p)}
              on_open={on_open_player}
              bench
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Top-level block header (Starting XI / Bench): bold, bright, with a count and
 * a rule line running to the edge — a deliberately STRONGER tier than the faint
 * per-position labels, so the starter↔bench split is unmistakable at a glance. */
function GroupHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px" }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "rgba(255,255,255,.82)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {count != null && (
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)" }}>
          {count}
        </span>
      )}
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div
        style={{
          // Subordinate to GroupHeader: smaller, fainter, indented, no rule.
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: "rgba(255,255,255,.32)",
          padding: "0 2px 0 6px",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function RichRosterCard({
  p,
  team_color,
  events,
  sub_info,
  bench,
  watched,
  delta,
  on_open,
}: {
  p: MatchPlayer;
  team_color?: string;
  events?: MatchEventCounts;
  sub_info?: SubInfo;
  bench?: boolean;
  /** In the viewer's watchlist → a small grey star next to the name. */
  watched?: boolean;
  /** This-match price move (%) = change_this_match. Drives the MATCH delta and
   * the heat tint. 0 before kickoff and for players who didn't feature. */
  delta: number;
  on_open: (player_id: number) => void;
}) {
  const ref_player = players_api.get(p.id);
  const valuation = valuations_api.get_for_player(p.id);
  const price = valuation?.current_price ?? p.value;
  // TOTAL comes from the valuation (single source, reconciles with the price);
  // MATCH is ``delta`` = change_this_match (this fixture only), passed in.
  const total_change = valuation?.change_since_inception ?? 0; // % since tournament open
  const rating = p.rating;
  // Full name — the row is clean (no in-row chart) so there's room for it.
  const display_name = p.full_name ?? p.name;
  const exact_position = ref_player?.detailed_position ?? POSITION_FALLBACK[p.position];
  const photo = ref_player?.image_path ?? null;
  const held = portfolio_api.holds(p.id);
  // Per-card kit colour (real provider data → literal interpolation is allowed).
  // Guard the empty string ("" is falsy-but-not-nullish, so ?? wouldn't catch it).
  const tc = team_color && team_color.trim() ? team_color : "#8a8a8a";
  // Neutral card background for everyone — no perf-driven tint. Held state is
  // marked by ONE signal only: the small blue dot by the name (see below).
  const base_bg = "rgba(255,255,255,.025)";

  return (
    <button
      type="button"
      onClick={() => on_open(p.id)}
      title="Open player"
      className="match-card"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "stretch",
        width: "100%",
        height: 74,
        padding: 0,
        background: base_bg,
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 14,
        cursor: "pointer",
        overflow: "hidden",
        fontFamily: "inherit",
        color: "#fff",
        textAlign: "left",
        opacity: bench ? 0.72 : 1,
      }}
    >
      {/* Jersey number — no cell background; the kit colour lives only in the
          number's outline (the harmonising touch), like fixture_new. */}
      <div
        style={{
          width: 44,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <span
          aria-hidden
          className="mono"
          style={{
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: -1.5,
            lineHeight: 1,
            // White fill cerned by a thin kit-colour outline — the only
            // team-colour cue now that the cell background is gone. (Grey only
            // when the kit colour is absent from the provider data — we don't
            // invent one.)
            color: "#fff",
            // Default paint order (fill THEN stroke) so the kit-colour outline
            // is drawn fully ON TOP — visible at its real width, unlike
            // "stroke fill" where the white fill hid the inner half.
            WebkitTextStroke: `1px ${tc}`,
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {p.jersey_number}
        </span>
      </div>

      {/* Portrait — no cell background (transparent), bottom-anchored headshot. */}
      <div
        style={{
          position: "relative",
          width: 50,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {photo && (
          <img
            src={photo}
            alt=""
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              height: "90%",
              objectFit: "contain",
              objectPosition: "bottom center",
              display: "block",
            }}
          />
        )}
      </div>

      {/* Identity — takes the row's middle (clean, no in-row chart): full name,
          markers, then position + rating. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, padding: "0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ minWidth: 0, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: -0.1 }}>
            {display_name}
          </span>
          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
            {/* In your watchlist → grey star (brief: grey, never gold). */}
            {watched && (
              <span title="In your watchlist" aria-label="In your watchlist" style={{ fontSize: 11, lineHeight: 1, color: "rgba(255,255,255,.55)" }}>
                ★
              </span>
            )}
            {/* In your portfolio → small accent dot (same colour as the card's
                held accent). */}
            {held && (
              <span
                aria-label="In your portfolio"
                title="In your portfolio"
                style={{ width: 6, height: 6, borderRadius: "50%", background: color.accentBlue, display: "inline-block" }}
              />
            )}
            <MatchEventBadge events={events} variant="inline" />
            <SubBadge sub={sub_info} variant="inline" />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)", letterSpacing: 0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {exact_position}
          </span>
          {rating != null && <RatingChip rating={rating} />}
        </div>
      </div>

      {/* Live price + the two moves (THIS match, TOTAL), stacked + labelled like
          the fixture_new mock. TickValue gives the subtle one-shot pulse on each
          tick — no constant blinking, no in-row chart. */}
      <div style={{ flexShrink: 0, alignSelf: "center", textAlign: "right", padding: "0 12px 0 8px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span className="mono" style={{ fontSize: 14, fontWeight: 800, lineHeight: 1 }}>
          <TickValue value={price}>{fmt_eur_m(price)}</TickValue>
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
          {/* MATCH = this fixture's move (change_this_match): 0% before kickoff
              and for players who didn't feature — never the player's other match. */}
          <DeltaStat label="match" value={delta} inline />
          <DeltaStat label="total" value={total_change} dim inline />
        </div>
      </div>
    </button>
  );
}

/** One labelled delta (match / total): tiny uppercase label + a signed,
 * sign-coloured percentage. `dim` softens the secondary (total) reading.
 * `inline` lays label and value on one line (phone, stacked deltas); otherwise
 * label sits over the value (desktop, deltas side by side). */
function DeltaStat({
  label,
  value,
  dim,
  inline,
}: {
  label: string;
  value: number | null | undefined;
  dim?: boolean;
  inline?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: inline ? "row" : "column",
        alignItems: inline ? "baseline" : "flex-end",
        gap: inline ? 5 : 0,
        lineHeight: 1.1,
        opacity: dim ? 0.8 : 1,
      }}
    >
      <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: color_for_sign(value), marginTop: inline ? 0 : 1 }}>
        {fmt_signed_pct(value, 1)}
      </span>
    </div>
  );
}

/** Match rating as a clean monochrome chip (white, never gold — per brief). */
function RatingChip({ rating }: { rating: number }) {
  return (
    <span
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "baseline",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 5,
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.07)",
      }}
    >
      <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>
        {rating.toFixed(1)}
      </span>
      <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,.38)" }}>
        rtg
      </span>
    </span>
  );
}
