/* TeamRoster — single-team rich roster for the match List view.
 *
 * One team at a time, full-width cards grouped by position (XI, then a Bench
 * section). Each card is a small "player tile" built around the FIFA-shirt
 * motif: a kit-coloured shirt panel on the left carrying the portrait with the
 * jersey number embossed behind it (player + number + kit colour tied into one
 * identity block), then the trade signal — name + live match events, exact
 * position + match rating, the IN-MATCH performance curve, the live price with
 * a subtle one-shot tick pulse, and this-match move. A quiet left accent marks
 * a held position. Tap opens the full PlayerSheet (chart + stats + trade).
 *
 * DDD role: presentational UI. All values are real provider data (match rating,
 * in-match price curve, universe valuation, holdings, kit colour) — nothing
 * synthesised. Single responsive component → web/mobile aligned by construction.
 */

import type { MatchPlayer } from "@fundxi/core/domain/match/match";
import type { Position } from "@fundxi/core/domain/player/player";
import type { SubInfo } from "@fundxi/core/domain/match/substitutions";
import { players_api } from "@fundxi/core/api/players_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { spark_for_player } from "@fundxi/core/infrastructure/repositories/valuations_repository";
import { Spark } from "@/ui/components/Spark";
import { TickValue } from "@/ui/components/TickValue";
import { useViewport } from "@/ui/hooks/use_viewport";
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

// Cap the rich-card column to a comfortable reading measure: at the app's
// 1800px width a full-stretch single-team row leaves a dead gap in the middle.
// The cap keeps the row tight; the in-match curve fills whatever middle remains.
const ROSTER_MAX_WIDTH = 720;

export function TeamRoster({ xi, bench, team_color, event_counts, subs, squad_mode, watchlist, on_open_player }: TeamRosterProps) {
  // Phone width: drop the in-row chart (it gets crushed) and hand the freed
  // space to the full player name. Desktop keeps the elastic curve.
  const { is_mobile } = useViewport();
  const by_pos = group_by_position(xi);
  const bench_ordered = POSITION_GROUPS.flatMap(g => group_by_position(bench).get(g.key) ?? []);

  return (
    // gap 18 between the two top-level blocks (XI / Bench) so the starter↔sub
    // break reads as a real separation, not just another position group.
    <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%", maxWidth: ROSTER_MAX_WIDTH }}>
      {/* Starting XI — strong group header, then position sub-groups (faint).
          Hidden in squad mode (pre-lineup full squad, no XI/Bench split). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!squad_mode && <GroupHeader label="XI" />}
        {POSITION_GROUPS.map(g => {
          const rows = by_pos.get(g.key) ?? [];
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
                  compact={is_mobile}
                  watched={watchlist?.has(p.id) ?? false}
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
              compact={is_mobile}
              watched={watchlist?.has(p.id) ?? false}
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
  compact,
  watched,
  on_open,
}: {
  p: MatchPlayer;
  team_color?: string;
  events?: MatchEventCounts;
  sub_info?: SubInfo;
  bench?: boolean;
  /** Phone width: hide the in-row chart and show the player's full name. */
  compact?: boolean;
  /** In the viewer's watchlist → a small grey star next to the name. */
  watched?: boolean;
  on_open: (player_id: number) => void;
}) {
  const ref_player = players_api.get(p.id);
  const valuation = valuations_api.get_for_player(p.id);
  const price = valuation?.current_price ?? p.value;
  // BOTH deltas come from the SAME valuation object (single source) so they can
  // never desync — match% used to come from the match payload (a separate fetch
  // refreshed on a different cadence), which made it disagree with total% mid-
  // play while the price moved. Fall back to the match payload only if the
  // valuation hasn't loaded. (COHERENCE-INVARIANT.)
  const match_change = valuation?.change_last_match ?? p.change_last_match; // % over THIS match
  const total_change = valuation?.change_since_inception ?? 0; // % since tournament open
  const rating = p.rating;
  // On phones the chart is gone, so there's room for the full name; on desktop
  // keep the short display name (the elastic curve takes the middle).
  const display_name = compact ? (p.full_name ?? p.name) : p.name;
  const exact_position = ref_player?.detailed_position ?? POSITION_FALLBACK[p.position];
  const photo = ref_player?.image_path ?? null;
  const held = portfolio_api.get_holding_metrics(p.id) != null;
  // Real price-history sparkline (resampled, refreshed live on each tick). NOT
  // scoped to this fixture — a true match-scoped curve would need the backend to
  // expose per-player in-match points (deferred decision).
  const spark = spark_for_player(p.id);
  // Per-card kit colour (real provider data → literal interpolation is allowed).
  // Guard the empty string ("" is falsy-but-not-nullish, so ?? wouldn't catch it).
  const tc = team_color && team_color.trim() ? team_color : "#8a8a8a";

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
        background: held
          ? "color-mix(in srgb, var(--color-accent-blue) 8%, rgba(255,255,255,.022))"
          : "rgba(255,255,255,.025)",
        border: `1px solid ${held ? "color-mix(in srgb, var(--color-accent-blue) 30%, transparent)" : "rgba(255,255,255,.05)"}`,
        // Quiet left accent marking a held position (no loud badge).
        boxShadow: held ? `inset 2px 0 0 0 ${color.accentBlue}` : "none",
        borderRadius: 14,
        cursor: "pointer",
        overflow: "hidden",
        fontFamily: "inherit",
        color: "#fff",
        textAlign: "left",
        opacity: bench ? 0.72 : 1,
      }}
    >
      {/* Jersey-number tile — its OWN dedicated cell in the kit colour, the
          number embossed (kit-coloured outline, slight skew) like the back of a
          shirt. Kept separate from the portrait so the head can never cover it. */}
      <div
        style={{
          width: 48,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderRight: "1px solid rgba(255,255,255,.05)",
          background: `linear-gradient(180deg, ${tc}30, ${tc}0f)`,
        }}
      >
        <span
          aria-hidden
          className="mono"
          style={{
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: -2,
            lineHeight: 1,
            transform: "skewX(-7deg)",
            // White fill cerned by the kit colour (paint-order draws the stroke
            // UNDER the fill) — legible on dark kits where a kit-only outline
            // washes out (e.g. France navy), still carrying the team colour.
            color: "#fff",
            WebkitTextStroke: `2px ${tc}`,
            paintOrder: "stroke fill",
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {p.jersey_number}
        </span>
      </div>

      {/* Clean portrait cell — bottom-anchored on a soft kit radial. */}
      <div
        style={{
          position: "relative",
          width: 54,
          flexShrink: 0,
          overflow: "hidden",
          background: `radial-gradient(120% 85% at 50% 24%, ${tc}40, transparent 74%)`,
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

      {/* Identity — takes its natural width (full name + markers); NOT capped,
          so the name isn't truncated. The curve (flex:1) absorbs the remaining
          width and yields first when the row is tight — the name has priority. */}
      <div style={{ flex: compact ? 1 : "0 1 auto", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, padding: "0 10px" }}>
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

      {/* Performance curve — elastic: fills the row's middle (the dead space at
          the capped width). Hidden on phones, where the space goes to the full
          name instead (the squeezed thumbnail wasn't readable). Live-refreshed. */}
      {!compact && (
        <div style={{ flex: 1, minWidth: 0, alignSelf: "center", padding: "0 16px" }}>
          <Spark data={spark} width={240} height={26} responsive />
        </div>
      )}

      {/* Live price + BOTH moves we keep: THIS match and TOTAL (since the player
          entered our universe), labelled like the legacy card. TickValue gives
          the subtle one-shot pulse (tinted bg + ▲/▼ for 450ms) on each tick —
          no constant blinking. */}
      <div style={{ flexShrink: 0, alignSelf: "center", textAlign: "right", padding: "0 12px 0 8px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span className="mono" style={{ fontSize: 14, fontWeight: 800, lineHeight: 1 }}>
          <TickValue value={price}>{fmt_eur_m(price)}</TickValue>
        </span>
        {/* Phone: stack the two deltas (each on one line) so the price block
            stays narrow and never clips; desktop keeps them side by side. */}
        <div style={{ display: "flex", flexDirection: compact ? "column" : "row", gap: compact ? 2 : 10, alignItems: "flex-end" }}>
          <DeltaStat label="match" value={match_change} inline={compact} />
          <DeltaStat label="total" value={total_change} dim inline={compact} />
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
