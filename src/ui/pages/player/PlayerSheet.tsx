import { useEffect, useMemo, useState, type ReactNode } from "react"; // ReactNode kept for SectionTitle/SectionCard signatures

import { players_api } from "@/api/players_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import { valuations_api } from "@/api/valuations_api";
import { POSITION_LABEL, type Player } from "@/domain/player/player";
import { compute_period_return, compute_return_pct } from "@/domain/market/return";
import { compute_portfolio_share } from "@/domain/portfolio/portfolio_metrics";
import type { PricePoint } from "@/infrastructure/repositories/valuations_repository";
import type { PlayerTournamentStat } from "@/infrastructure/repositories/player_stats_repository";
import type { PlayerMatchEntry } from "@/infrastructure/repositories/player_matches_repository";
import type { PlayerNewsEntry } from "@/infrastructure/repositories/player_news_repository";
import { Sheet } from "@/ui/components/Sheet";
import { color_for_sign, fmt_eur_m, fmt_eur_m_signed, fmt_signed_pct } from "@/ui/helpers/format";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { usePlayerLiveVersion, useLiveRefetch } from "@/ui/hooks/use_live_updates";
import { TradeDialog } from "@/ui/components/TradeDialog";
import { AuthDialog } from "@/ui/components/AuthDialog";
import { useAuth } from "@/ui/shell/AuthContext";

// Wikipedia-style synthetic bio composed from the data we have. Until a
// real biographical source (Wikipedia API / curated CMS) is wired in.
function synthesize_bio(player: Player, team_name: string, confederation?: string): string {
  const display_name = player.full_name ?? player.name;
  const detailed = player.detailed_position;
  const position_label = (detailed ?? POSITION_LABEL[player.position]).toLowerCase();
  const article = /^[aeiou]/i.test(position_label) ? "an" : "a";
  const age_clause = player.age ? `${player.age}-year-old ` : "";
  const conf_clause = confederation ? ` (${confederation})` : "";
  const intro = `${display_name} is ${article} ${age_clause}${position_label} representing ${team_name}${conf_clause}.`;
  const origin_bits: string[] = [];
  if (player.birth_city) origin_bits.push(player.birth_city);
  if (player.nationality_name && player.nationality_name !== team_name) origin_bits.push(player.nationality_name);
  const origin_part = origin_bits.length > 0 ? ` Born in ${origin_bits.join(", ")}.` : "";
  const club_part = player.club ? ` He currently plays his club football at ${player.club}.` : "";
  const physical_bits: string[] = [];
  if (player.height) physical_bits.push(`stands ${player.height}`);
  if (player.weight) physical_bits.push(`weighs ${player.weight}`);
  if (player.foot) physical_bits.push(`favours his ${player.foot.toLowerCase()} foot`);
  const physical = physical_bits.length > 0 ? ` He ${physical_bits.join(", ")}.` : "";
  const role_hint =
    player.position === "GK"
      ? " Operates as the team's last line of defence."
      : player.position === "DF"
        ? " A defensive presence trusted to mark and tackle."
        : player.position === "MF"
          ? " A midfielder relied on to dictate tempo and link the lines."
          : " An attacking option tasked with creating and finishing chances.";
  return intro + origin_part + club_part + physical + role_hint;
}

// Synthetic top-skills by position. Until a real skills source (FBref / curated
// scouting CMS) is wired in. We pick a deterministic subset using player.id so
// the same player always shows the same chips, but two players in the same
// position don't all show the identical list.
const SKILL_POOLS: Record<Player["position"], readonly string[]> = {
  GK: ["Shot Stopping", "Reflexes", "Aerial", "Distribution", "Command", "1v1", "Composure"],
  DF: ["Tackling", "Marking", "Heading", "Positioning", "Strength", "Pace", "Composure"],
  MF: ["Passing", "Vision", "Stamina", "Dribbling", "Long Shot", "Tackle", "Press Resistance"],
  FW: ["Finishing", "Pace", "Dribbling", "Off-the-ball", "Heading", "Press", "Link-up"],
};

function pick_skills(player: Player, count = 5): string[] {
  const pool = SKILL_POOLS[player.position];
  const seed = player.id;
  const out: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count && out.length < pool.length; i++) {
    let idx = (seed * 31 + i * 17 + i * i) % pool.length;
    while (used.has(idx)) idx = (idx + 1) % pool.length;
    used.add(idx);
    out.push(pool[idx]);
  }
  return out;
}

interface PlayerSheetProps {
  player: Player;
  on_close: () => void;
  go_portfolio?: () => void;
  go_match?: (fixture_id: number) => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function PlayerSheet({ player, on_close, go_portfolio, go_match, watchlist, toggle_watch }: PlayerSheetProps) {
  const team = teams_api.get(player.team_id) ?? {
    id: "?",
    name: "?",
    flag: "🏳️",
    color: "#888",
    kind: "national" as const,
  };
  const valuation = valuations_api.get_for_player(player.id);
  const current_price = valuation?.current_price ?? 0;
  const performance_rating = valuation?.performance_rating ?? 0;

  const [trade_dialog_kind, set_trade_dialog_kind] = useState<"buy" | "sell" | null>(null);
  const [auth_prompt_open, set_auth_prompt_open] = useState(false);
  const { status: auth_status } = useAuth();
  const is_watched = watchlist?.has(player.id) ?? false;

  const handle_trade_click = (kind: "buy" | "sell") => {
    if (auth_status === "authenticated") {
      set_trade_dialog_kind(kind);
    } else if (auth_status === "anonymous") {
      set_auth_prompt_open(true);
    }
  };

  // Per-match summary list for this player — replaces the stand-alone
  // commentary feed (which lacked match context). Each entry carries the
  // fixture metadata + the player's stat line; click-through reopens the
  // dedicated MatchView for full context.
  const [match_entries, set_match_entries] = useState<PlayerMatchEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    set_match_entries(null);
    players_api
      .get_matches(player.id)
      .then(items => {
        if (!cancelled) set_match_entries(items);
      })
      .catch(() => {
        if (!cancelled) set_match_entries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  // Team-level news (Sportmonks news are tied to fixtures, not players).
  // Lazy on first render of the news tab; we still fire the fetch up-front
  // so switching tabs feels instant.
  const [news_entries, set_news_entries] = useState<PlayerNewsEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    set_news_entries(null);
    players_api
      .get_news(player.id)
      .then(items => {
        if (!cancelled) set_news_entries(items);
      })
      .catch(() => {
        if (!cancelled) set_news_entries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  const [active_tab, set_active_tab] = useState<"matches" | "news">("matches");

  // Real engine price-tick history. Single chart from the tournament baseline
  // through the latest tick. No period filtering in v0 — it would be honest
  // only once we have intra-match (M4 LiveWorker) ticks.
  const player_live_version = usePlayerLiveVersion(player.id);
  const [price_history, set_price_history] = useState<PricePoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    set_price_history(null);
    valuations_api
      .get_price_history(player.id)
      .then(points => {
        if (!cancelled) set_price_history(points);
      })
      .catch(() => {
        if (!cancelled) set_price_history([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player.id]);
  // Live refresh: a new price tick for this player refreshes the universe-wide
  // valuations (current price / rating) and then re-fetches this player's tick
  // history — setting which triggers the re-render, so the KPIs read the fresh
  // valuation. Chained so the order is deterministic.
  useLiveRefetch(player_live_version, () => {
    valuations_api
      .refresh()
      .then(() => valuations_api.refresh_price_history(player.id))
      .then(set_price_history)
      .catch(() => {
        /* keep the current curve / valuation on a transient error */
      });
  });

  const [tournament_stats, set_tournament_stats] = useState<PlayerTournamentStat | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    set_tournament_stats(undefined);
    players_api
      .get_tournament_stats(player.id)
      .then(stats => {
        if (!cancelled) set_tournament_stats(stats);
      })
      .catch(() => {
        if (!cancelled) set_tournament_stats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  const chart_points = useMemo(() => (price_history ?? []).map(p => p.price), [price_history]);
  const [hover_idx, set_hover_idx] = useState<number | null>(null);
  const period_return = compute_period_return(chart_points);
  const period_is_up = chart_points.length > 1 && chart_points[chart_points.length - 1] >= chart_points[0];
  const period_color = period_is_up ? "var(--color-chart-primary)" : "var(--color-action-sell)";

  return (
    <Sheet open={true} on_close={on_close} max_width={1080}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: "92vh" }}>
        {/* IDENTITY BAND — full-width header spanning both columns.
            Just the player identity row (photo, name, flag/team, ★, jersey).
            Personal info and About live below, each in their own column. */}
        <div
          style={{
            padding: "16px 24px 12px",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {player.image_path ? (
              <img
                src={player.image_path}
                alt={player.full_name ?? player.name}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 10,
                  objectFit: "contain",
                  background: "rgba(255,255,255,.05)",
                  border: "1px solid rgba(255,255,255,.08)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <PlayerChip jersey_number={player.jersey_number} team_color={team.color} size={72} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    letterSpacing: -0.5,
                    color: "rgba(255,255,255,.55)",
                  }}
                >
                  {player.jersey_number}
                </span>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: -0.5 }}>
                  {player.full_name ?? player.name}
                </div>
                <button
                  onClick={() => toggle_watch?.(player.id)}
                  aria-label={is_watched ? "Remove from watchlist" : "Add to watchlist"}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: is_watched ? "rgba(255,255,255,.08)" : "transparent",
                    border: "1px solid rgba(255,255,255,.08)",
                    color: is_watched ? "#fff" : "rgba(255,255,255,.5)",
                    cursor: "pointer",
                    fontSize: 14,
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    alignSelf: "center",
                  }}
                >
                  {is_watched ? "★" : "☆"}
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                  fontSize: 13,
                  color: "rgba(255,255,255,.65)",
                }}
              >
                {team.flag_url ? (
                  <img
                    src={team.flag_url}
                    alt={team.name}
                    style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }}
                  />
                ) : team.flag ? (
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{team.flag}</span>
                ) : null}
                <span style={{ fontWeight: 700 }}>{team.name}</span>
              </div>
            </div>
          </div>
        </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(380px, 1fr)", gridTemplateRows: "1fr", flex: 1, minHeight: 0 }}>
        {/* LEFT: chart-side — chart sticky + Fixtures/News scroll */}
        <div
          style={{
            borderRight: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minHeight: 0,
            height: "100%",
          }}
        >
        <div
          style={{
            padding: "20px 24px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            flexShrink: 0,
          }}
        >
          {/* Valuation — ribbon of KPIs above the chart (stock-app pattern). */}
          {(() => {
            const own_holding = portfolio_api.get_holding(player.id);
            const own_shares = own_holding?.shares ?? 0;
            const pnl = own_shares !== 0
              ? own_shares * (current_price - (own_holding?.average_buy_price ?? 0))
              : null;
            const ph = price_history ?? [];
            const since_start_pct =
              ph.length > 1 ? compute_period_return(ph.map(p => p.price)) : null;
            let last_match_pct: number | null = null;
            if (ph.length > 1) {
              const last_fixture_id = [...ph].reverse().find(p => p.fixture_id !== null)?.fixture_id;
              if (last_fixture_id != null) {
                const ticks = ph.filter(p => p.fixture_id === last_fixture_id);
                if (ticks.length > 1) {
                  last_match_pct = compute_period_return(ticks.map(t => t.price));
                }
              }
            }
            const apps = tournament_stats?.appearances ?? null;
            const avg_match_pct = since_start_pct !== null && apps && apps > 0 ? since_start_pct / apps : null;
            const fmt_pct = (v: number | null): string =>
              v === null ? "—" : `${fmt_signed_pct(v, 1)}`;
            const pct_color = (v: number | null): string | undefined =>
              v === null ? undefined : color_for_sign(v);
            return (
              <SectionCard title="Valuation">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0 }}>
                  <SmallKpi label="Value" value={`€${current_price}M`} />
                  <SmallKpi label="Rating" value={String(performance_rating)} color="rgba(255,255,255,.85)" />
                  <SmallKpi
                    label="P&L"
                    value={pnl !== null ? fmt_eur_m_signed(pnl) : "—"}
                    color={pnl !== null ? (color_for_sign(pnl)) : undefined}
                  />
                  <SmallKpi label="Since Start" value={fmt_pct(since_start_pct)} color={pct_color(since_start_pct)} />
                  <SmallKpi label="Last Match" value={fmt_pct(last_match_pct)} color={pct_color(last_match_pct)} />
                  <SmallKpi label="Avg / Match" value={fmt_pct(avg_match_pct)} color={pct_color(avg_match_pct)} />
                </div>
              </SectionCard>
            );
          })()}

          {/* Chart */}
          <div style={{ position: "relative" }}>
            {(() => {
              const w = 600;
              const h = 260;
              const pd = 8;
              const has_history = chart_points.length >= 2;
              // When the player has no real ticks yet (rookies, didn't play),
              // render a flat baseline at mid-height so the chart frame is
              // always present and the layout below stays anchored.
              const min = has_history ? Math.min(...chart_points) : 0;
              const max = has_history ? Math.max(...chart_points) : 1;
              const range = max - min || 1;
              const points = has_history
                ? chart_points.map((v, i) => ({
                    x: pd + (i / (chart_points.length - 1)) * (w - pd * 2),
                    y: pd + ((max - v) / range) * (h - pd * 2),
                  }))
                : [
                    { x: pd, y: h / 2 },
                    { x: w - pd, y: h / 2 },
                  ];
              const polyline = points.map(p => `${p.x},${p.y}`).join(" ");
              const last = points[points.length - 1];
              const active_idx =
                has_history && hover_idx !== null && hover_idx >= 0 && hover_idx < points.length
                  ? hover_idx
                  : null;
              const active_pt = active_idx !== null ? points[active_idx] : null;
              const active_record =
                active_idx !== null && price_history ? price_history[active_idx] : null;
              const handle_move = (e: React.MouseEvent<SVGSVGElement>) => {
                if (!has_history) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                const svg_x = ratio * w;
                let closest = 0;
                let best = Infinity;
                for (let i = 0; i < points.length; i++) {
                  const d = Math.abs(points[i].x - svg_x);
                  if (d < best) {
                    best = d;
                    closest = i;
                  }
                }
                set_hover_idx(closest);
              };
              return (
                <svg
                  width="100%"
                  viewBox={`0 0 ${w} ${h}`}
                  style={{ display: "block", cursor: "crosshair" }}
                  onMouseMove={handle_move}
                  onMouseLeave={() => set_hover_idx(null)}
                >
                  <defs>
                    <linearGradient id="player_chart_grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={period_color} stopOpacity="1" />
                      <stop offset="10%" stopColor={period_color} stopOpacity="1" />
                      <stop offset="100%" stopColor={period_color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 0.5, 1].map((p, i) => (
                    <line
                      key={i}
                      x1={pd}
                      x2={w - pd}
                      y1={pd + p * (h - pd * 2)}
                      y2={pd + p * (h - pd * 2)}
                      stroke="rgba(255,255,255,.04)"
                    />
                  ))}
                  <polygon
                    points={`${points[0].x},${h - pd} ${polyline} ${last.x},${h - pd}`}
                    fill="url(#player_chart_grad)"
                  />
                  <polyline
                    points={polyline}
                    fill="none"
                    stroke={period_color}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity=".1"
                  />
                  <polyline
                    points={polyline}
                    fill="none"
                    stroke={period_color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {has_history && (
                    <circle cx={last.x} cy={last.y} r="9" fill={period_color} opacity=".15" />
                  )}
                  {!has_history && (
                    <text
                      x={w / 2}
                      y={h / 2 - 12}
                      textAnchor="middle"
                      fill="rgba(255,255,255,.35)"
                      fontSize="13"
                      fontWeight="600"
                    >
                      No matches played yet
                    </text>
                  )}
                  {active_pt && (
                    <>
                      <line
                        x1={active_pt.x}
                        x2={active_pt.x}
                        y1={pd}
                        y2={h - pd}
                        stroke="rgba(255,255,255,.35)"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <circle
                        cx={active_pt.x}
                        cy={active_pt.y}
                        r="6"
                        fill="#fff"
                        stroke={period_color}
                        strokeWidth="2"
                      />
                    </>
                  )}
                </svg>
              );
            })()}
            {(() => {
              if (chart_points.length < 2) return null;
              if (hover_idx === null || !price_history) return null;
              const rec = price_history[hover_idx];
              if (!rec) return null;
              const ratio = hover_idx / (chart_points.length - 1);
              const left_pct = `${(ratio * 100).toFixed(2)}%`;
              const dt = new Date(rec.ts);
              const date_label = dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
              const time_label = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
              // % change since tournament open (first tick) → hovered point.
              // Stable reference so successive hovers can be read against each
              // other: a 14% hover then a 10% hover means a 4pp local drop.
              const first_price = price_history[0].price;
              const delta_pct = compute_return_pct(rec.price, first_price);
              const delta_label = `${fmt_signed_pct(delta_pct, 2)}`;
              const delta_color = color_for_sign(delta_pct);
              return (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: left_pct,
                    transform: ratio < 0.15 ? "translateX(0)" : ratio > 0.85 ? "translateX(-100%)" : "translateX(-50%)",
                    background: "rgba(7,8,29,.92)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    pointerEvents: "none",
                    minWidth: 130,
                    boxShadow: "0 6px 20px rgba(0,0,0,.4)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                      €{rec.price.toFixed(2)}M
                    </div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: delta_color }}>
                      {delta_label}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>
                    {date_label} · {time_label}
                  </div>
                </div>
              );
            })()}
          </div>

        </div>

        {/* Match log — sticky title + scrollable list of matches the player
            appeared in. Each row gives the match context (opponent, score,
            W/D/L) and the player's stat line, derived entirely from our DB. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: "0 24px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: 4 }}>
              {(["matches", "news"] as const).map(tab => {
                const active = active_tab === tab;
                const label = tab === "matches" ? "Fixtures" : "News";
                return (
                  <button
                    key={tab}
                    onClick={() => set_active_tab(tab)}
                    style={{
                      background: active ? "rgba(255,255,255,.06)" : "transparent",
                      border: "1px solid rgba(255,255,255,.06)",
                      color: active ? "#fff" : "rgba(255,255,255,.45)",
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      borderRadius: 5,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.25)" }}>
              {active_tab === "matches"
                ? match_entries === null
                  ? "loading…"
                  : `${match_entries.length} appearances`
                : news_entries === null
                  ? "loading…"
                  : `${news_entries.length} articles`}
            </span>
          </div>
          <div
            className="scroll-visible"
            style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}
          >
            {active_tab === "matches" ? <>
            {match_entries === null && (
              <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                loading…
              </div>
            )}
            {match_entries !== null && match_entries.length === 0 && (
              <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                No matches played yet for this player.
              </div>
            )}
            {match_entries?.map(m => {
              const is_home = m.player_team_id === m.home_team_id;
              const home = teams_api.get(m.home_team_id);
              const away = teams_api.get(m.away_team_id);
              const opp = is_home ? away : home;
              const my_score = is_home ? m.home_score : m.away_score;
              const opp_score = is_home ? m.away_score : m.home_score;
              const is_finished = m.status === "finished";
              const is_live = m.status === "live";
              const is_upcoming = m.status === "upcoming";
              const result =
                !is_finished || my_score == null || opp_score == null
                  ? null
                  : my_score > opp_score
                    ? "W"
                    : my_score < opp_score
                      ? "L"
                      : "D";
              const result_color =
                result === "W" ? "var(--color-positive)" : result === "L" ? "var(--color-negative)" : "rgba(255,255,255,.45)";
              const dt = m.kickoff_at ? new Date(m.kickoff_at) : null;
              const date_label = dt
                ? dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })
                : "—";
              const time_label = dt
                ? dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                : "";
              const score_label = my_score != null && opp_score != null ? `${my_score}-${opp_score}` : "—";
              const pct_label =
                m.in_match_pct != null
                  ? `${fmt_signed_pct(m.in_match_pct, 2)}`
                  : "—";
              const pct_color =
                m.in_match_pct == null
                  ? "rgba(255,255,255,.3)"
                  : m.in_match_pct >= 0
                    ? "var(--color-positive)"
                    : "var(--color-negative)";
              return (
                <div
                  key={m.fixture_id}
                  onClick={() => go_match?.(m.fixture_id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 22px minmax(0, 1fr) auto auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: is_live
                      ? "rgba(244,18,88,.08)"
                      : is_upcoming
                        ? "rgba(255,255,255,.015)"
                        : "rgba(255,255,255,.025)",
                    border: `1px solid ${is_live ? "rgba(244,18,88,.25)" : "rgba(255,255,255,.05)"}`,
                    cursor: go_match ? "pointer" : "default",
                  }}
                >
                  {is_live ? (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#fff",
                        background: "var(--color-action-sell)",
                        padding: "2px 5px",
                        borderRadius: 3,
                        letterSpacing: 0.6,
                      }}
                    >
                      LIVE
                    </span>
                  ) : is_upcoming ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", letterSpacing: 0.5 }}>
                      SOON
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 800, color: result_color, letterSpacing: 0.5 }}>
                      {result ?? "—"}
                    </span>
                  )}
                  {opp?.flag_url ? (
                    <img
                      src={opp.flag_url}
                      alt={opp.name}
                      style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }}
                    />
                  ) : (
                    <span style={{ fontSize: 16 }}>{opp?.flag ?? ""}</span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {opp?.name ?? (is_home ? m.away_team_id : m.home_team_id)}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>
                      {is_upcoming || is_live
                        ? `${date_label}${time_label ? ` · ${time_label}` : ""}`
                        : `${date_label}${m.role ? ` · ${m.role === "starter" ? "starter" : "bench"}` : ""}`}
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>
                    {is_finished || is_live ? score_label : "—"}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: is_finished ? pct_color : "rgba(255,255,255,.3)",
                      minWidth: 64,
                      textAlign: "right",
                    }}
                  >
                    {is_finished ? pct_label : "—"}
                  </span>
                </div>
              );
            })}
            </> : <>
              {news_entries === null && (
                <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                  loading…
                </div>
              )}
              {news_entries !== null && news_entries.length === 0 && (
                <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                  No news yet for this player's team.
                </div>
              )}
              {news_entries?.map(n => {
                const dt = n.published_at ? new Date(n.published_at) : null;
                const date_label = dt
                  ? dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })
                  : "—";
                const type_label = n.type === "prematch" ? "PRE" : n.type === "postmatch" ? "POST" : n.type.toUpperCase();
                return (
                  <div
                    key={n.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "44px minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,.025)",
                      border: "1px solid rgba(255,255,255,.05)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "rgba(255,255,255,.55)",
                        background: "rgba(255,255,255,.04)",
                        border: "1px solid rgba(255,255,255,.06)",
                        padding: "2px 5px",
                        borderRadius: 4,
                        textAlign: "center",
                        letterSpacing: 0.6,
                      }}
                    >
                      {type_label}
                    </span>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#fff",
                        lineHeight: 1.35,
                      }}
                    >
                      {n.title}
                    </div>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)", whiteSpace: "nowrap" }}>
                      {date_label}
                    </span>
                  </div>
                );
              })}
            </>}
          </div>
        </div>
        </div>

        {/* RIGHT: info-side — Personal / Skills / Stats / Valuation / Position / Buy-Sell */}
        <div
          style={{
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflowY: "auto",
            maxHeight: "92vh",
          }}
        >
          {false && (
            <SectionCard title="About">
              <div
                style={{
                  background: "rgba(255,255,255,.025)",
                  border: "1px solid rgba(255,255,255,.05)",
                  padding: "8px 10px",
                  fontSize: 12,
                  color: "#fff",
                  lineHeight: 1.45,
                }}
              >
                {player.bio ?? synthesize_bio(player, team.name, team.confederation)}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Personal">
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 0 }}>
              <SmallKpi
                label="Position"
                value={player.detailed_position ?? POSITION_LABEL[player.position]}
                mono={false}
              />
              <SmallKpi label="Age" value={String(player.age ?? "—")} />
              <SmallKpi label="Foot" value={player.foot ?? "—"} mono={false} />
              <SmallKpi label="Height" value={player.height ?? "—"} />
              <SmallKpi label="Weight" value={player.weight ?? "—"} />
            </div>
          </SectionCard>

          <SectionCard title="Skills">
            <div
              style={{
                display: "flex",
                gap: 0,
                flexWrap: "wrap",
                background: "rgba(255,255,255,.025)",
                border: "1px solid rgba(255,255,255,.05)",
                padding: "6px",
              }}
            >
              {(player.tags && player.tags.length > 0 ? player.tags : pick_skills(player)).map(t => (
                <span
                  key={t}
                  style={{
                    margin: 2,
                    padding: "5px 10px",
                    borderRadius: 5,
                    fontSize: 12,
                    fontWeight: 800,
                    background: "rgba(255,255,255,.06)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,.1)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </SectionCard>

          {tournament_stats !== undefined && tournament_stats !== null && (
            <SectionCard title="Statistics">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
                <SmallKpi label="Appearances" value={String(tournament_stats.appearances ?? 0)} />
                <SmallKpi label="Min" value={String(tournament_stats.minutes_played ?? 0)} />
                <SmallKpi
                  label="Goals"
                  value={String(tournament_stats.goals ?? 0)}
                  color={(tournament_stats.goals ?? 0) > 0 ? "var(--color-positive)" : undefined}
                />
                <SmallKpi
                  label="Assists"
                  value={String(tournament_stats.assists ?? 0)}
                  color={(tournament_stats.assists ?? 0) > 0 ? "var(--color-positive)" : undefined}
                />
                <SmallKpi
                  label="Shots"
                  value={`${tournament_stats.shots_on_target ?? 0}/${tournament_stats.shots_total ?? 0}`}
                />
                <SmallKpi
                  label="Yellow Cards"
                  value={String(tournament_stats.yellow_cards ?? 0)}
                  color={(tournament_stats.yellow_cards ?? 0) > 0 ? "#E0A800" : undefined}
                />
                <SmallKpi
                  label="Red Cards"
                  value={String(tournament_stats.red_cards ?? 0)}
                  color={(tournament_stats.red_cards ?? 0) > 0 ? "var(--color-negative)" : undefined}
                />
                <SmallKpi label="Key Passes" value={String(tournament_stats.key_passes ?? 0)} />
              </div>
            </SectionCard>
          )}

          <YourPositionCard player={player} current_price={current_price} />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handle_trade_click("buy")}
              style={{
                flex: 1,
                padding: "13px 0",
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                background: "var(--color-action-buy)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 4px 16px rgba(92,242,108,.25)",
              }}
            >
              Buy
            </button>
            <button
              onClick={() => handle_trade_click("sell")}
              style={{
                flex: 1,
                padding: "13px 0",
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                background: "var(--color-action-sell)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 4px 16px rgba(244,18,88,.25)",
              }}
            >
              Sell
            </button>
          </div>
        </div>
      </div>
      </div>

      <TradeDialog
        open={trade_dialog_kind !== null}
        player={player}
        initial_kind={trade_dialog_kind ?? "buy"}
        on_close={() => set_trade_dialog_kind(null)}
        go_portfolio={() => {
          set_trade_dialog_kind(null);
          on_close();
          go_portfolio?.();
        }}
      />
      {auth_prompt_open && (
        <AuthDialog
          initial_mode="register"
          on_close={() => set_auth_prompt_open(false)}
        />
      )}
    </Sheet>
  );
}

function YourPositionCard({ player, current_price }: { player: Player; current_price: number }) {
  const holding = portfolio_api.get_holding(player.id);
  const totals = portfolio_api.get_totals();

  // Body height is fixed (filled-state grid height) so the empty-state
  // message and the populated grid take the same vertical space — keeps
  // Buy/Sell anchored regardless of holding state.
  const BODY_MIN_HEIGHT = 132;
  const has_position = !!holding && holding.shares !== 0;

  const header = (status_label: string, color: string, bg: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 10px",
        background: "rgba(255,255,255,.025)",
        borderBottom: "1px solid rgba(255,255,255,.05)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,.55)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Your position
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color,
          background: bg,
          padding: "3px 8px",
          borderRadius: 4,
          letterSpacing: 0.5,
        }}
      >
        {status_label}
      </span>
    </div>
  );

  const card_style: React.CSSProperties = {
    background: "rgba(255,255,255,.02)",
    border: "1px solid rgba(255,255,255,.05)",
    borderRadius: 10,
    overflow: "hidden",
  };

  if (!has_position) {
    return (
      <div style={card_style}>
        {header("—", "rgba(255,255,255,.4)", "rgba(255,255,255,.04)")}
        <div
          style={{
            minHeight: BODY_MIN_HEIGHT,
            padding: "12px 14px",
            fontSize: 12,
            color: "rgba(255,255,255,.4)",
            lineHeight: 1.5,
          }}
        >
          You don&apos;t hold this player. Use the trade panel below to open a position.
        </div>
      </div>
    );
  }

  const market_value = holding!.shares * current_price;
  const cost_basis = holding!.shares * holding!.average_buy_price;
  const pnl = market_value - cost_basis;
  const return_pct = compute_return_pct(market_value, cost_basis);
  const portfolio_pct = compute_portfolio_share(market_value, totals.total_value);
  const is_long = holding!.shares > 0;

  return (
    <div style={card_style}>
      {header(
        is_long ? "LONG" : "SHORT",
        is_long ? "var(--color-positive)" : "var(--color-negative)",
        is_long ? "rgba(55,255,99,.1)" : "rgba(255,40,93,.1)",
      )}
      <div
        style={{
          minHeight: BODY_MIN_HEIGHT,
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          alignContent: "center",
        }}
      >
        <PositionStat label="Shares" value={String(Math.abs(holding!.shares))} />
        <PositionStat label="Avg buy" value={`€${holding!.average_buy_price}M`} />
        <PositionStat label="Market value" value={fmt_eur_m(market_value)} />
        <PositionStat
          label="P&L"
          value={fmt_eur_m_signed(pnl)}
          color={color_for_sign(pnl)}
        />
        <PositionStat
          label="Return"
          value={`${fmt_signed_pct(return_pct, 1)}`}
          color={color_for_sign(return_pct)}
        />
        <PositionStat label="% portfolio" value={`${portfolio_pct.toFixed(1)}%`} />
      </div>
    </div>
  );
}

function PositionStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,.35)",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: color ?? "#fff", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  // Title cell + content row touch (no vertical gap), like Position + the
  // numeric strip in the left Personal section. Title loses its bottom border
  // and bottom radius so it visually blends into the cells below.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,.55)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          background: "rgba(255,255,255,.025)",
          border: "1px solid rgba(255,255,255,.05)",
          borderBottom: "none",
          borderRadius: "6px 6px 0 0",
          padding: "6px 10px",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}


function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "rgba(255,255,255,.5)",
        letterSpacing: 0.5,
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}


function SmallKpi({
  label,
  value,
  color,
  mono = true,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.025)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 6,
        padding: "6px 9px",
      }}
    >
      <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
        {label}
      </div>
      <div
        className={mono ? "mono" : ""}
        style={{ fontSize: 13, fontWeight: 800, color: color ?? "#fff", marginTop: 1 }}
      >
        {value}
      </div>
    </div>
  );
}
