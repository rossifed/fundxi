import { useEffect, useMemo, useState } from "react";
import { comments_api } from "@/api/comments_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import { valuations_api } from "@/api/valuations_api";
import type { MatchComment } from "@/domain/match/match_comment";
import { POSITION_LABEL, type Player } from "@/domain/player/player";
import type { PricePoint } from "@/infrastructure/repositories/valuations_repository";
import { Sheet } from "@/ui/components/Sheet";
import { fmt_eur_m, fmt_eur_m_signed } from "@/ui/helpers/format";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { TradeDialog } from "@/ui/components/TradeDialog";

// Wikipedia-style synthetic bio composed from the data we have. Until a
// real biographical source (Wikipedia API / curated CMS) is wired in.
function synthesize_bio(player: Player, team_name: string, confederation?: string): string {
  const display_name = player.full_name ?? player.name;
  const position_label = POSITION_LABEL[player.position].toLowerCase();
  const article = /^[aeiou]/i.test(position_label) ? "an" : "a";
  const age_clause = player.age ? `${player.age}-year-old ` : "";
  const conf_clause = confederation ? ` (${confederation})` : "";
  const intro = `${display_name} is ${article} ${age_clause}${position_label} representing ${team_name}${conf_clause}.`;
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
  return intro + club_part + physical + role_hint;
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

function comment_icon(c: MatchComment): string {
  if (c.is_goal) return "⚽";
  const t = c.comment.toLowerCase();
  if (/yellow card/.test(t)) return "🟨";
  if (/red card/.test(t)) return "🟥";
  if (/substitution|replaces/.test(t)) return "🔄";
  if (/penalty/.test(t)) return "🎯";
  if (/assist/.test(t)) return "🅰️";
  if (/save|goalkeeper/.test(t)) return "🧤";
  if (/corner/.test(t)) return "📐";
  if (/free kick/.test(t)) return "🎯";
  if (/foul/.test(t)) return "⚠️";
  return "▫️";
}

interface PlayerSheetProps {
  player: Player;
  on_close: () => void;
  go_portfolio?: () => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function PlayerSheet({ player, on_close, go_portfolio, watchlist, toggle_watch }: PlayerSheetProps) {
  const team = teams_api.get(player.team_id) ?? {
    id: "?",
    name: "?",
    flag: "🏳️",
    color: "#888",
    kind: "national" as const,
  };
  const valuation = valuations_api.get_for_player(player.id);
  const current_price = valuation?.current_price ?? 0;
  const change_24h = valuation?.change_24h ?? 0;
  const performance_rating = valuation?.performance_rating ?? 0;

  const [trade_dialog_kind, set_trade_dialog_kind] = useState<"buy" | "sell" | null>(null);
  const is_watched = watchlist?.has(player.id) ?? false;

  // Real Sportmonks commentary feed for this player. Loaded lazily on open;
  // cached in the repo so re-opening is instant.
  const [comments, set_comments] = useState<MatchComment[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    set_comments(null);
    comments_api
      .for_player(player.id, 100)
      .then(items => {
        if (!cancelled) set_comments(items);
      })
      .catch(() => {
        if (!cancelled) set_comments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  // Real engine price-tick history. Single chart from the tournament baseline
  // through the latest tick. No period filtering in v0 — it would be honest
  // only once we have intra-match (M4 LiveWorker) ticks.
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

  const chart_points = useMemo(() => (price_history ?? []).map(p => p.price), [price_history]);
  const [hover_idx, set_hover_idx] = useState<number | null>(null);
  const period_return =
    chart_points.length > 1
      ? ((chart_points[chart_points.length - 1] - chart_points[0]) / chart_points[0]) * 100
      : 0;
  const period_is_up = chart_points.length > 1 && chart_points[chart_points.length - 1] >= chart_points[0];
  const period_color = period_is_up ? "#183C82" : "#F41258";

  return (
    <Sheet open={true} on_close={on_close} max_width={1080}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(380px, 1fr)", gridTemplateRows: "1fr", height: "100%", maxHeight: "92vh" }}>
        {/* LEFT: hero + chart (sticky) + activity feed (scrolls) */}
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
          {/* Hero */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <PlayerChip jersey_number={player.jersey_number} team_color={team.color} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: -0.5 }}>
                {player.full_name ?? player.name}
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

          {/* Chart header — period return only */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 18, fontWeight: 800, color: period_return >= 0 ? "#216c6e" : "#E41541" }}>
              {period_return >= 0 ? "+" : ""}{period_return.toFixed(1)}%
            </span>
          </div>

          {/* Chart */}
          <div style={{ position: "relative" }}>
            {(() => {
              const w = 600;
              const h = 200;
              const pd = 8;
              if (chart_points.length < 2) return null;
              const min = Math.min(...chart_points);
              const max = Math.max(...chart_points);
              const range = max - min || 1;
              const points = chart_points.map((v, i) => ({
                x: pd + (i / (chart_points.length - 1)) * (w - pd * 2),
                y: pd + ((max - v) / range) * (h - pd * 2),
              }));
              const polyline = points.map(p => `${p.x},${p.y}`).join(" ");
              const last = points[points.length - 1];
              const active_idx =
                hover_idx !== null && hover_idx >= 0 && hover_idx < points.length ? hover_idx : null;
              const active_pt = active_idx !== null ? points[active_idx] : null;
              const active_record =
                active_idx !== null && price_history ? price_history[active_idx] : null;
              const handle_move = (e: React.MouseEvent<SVGSVGElement>) => {
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
                  {points.map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r="3"
                      fill={period_color}
                      stroke="#040810"
                      strokeWidth="2"
                    />
                  ))}
                  <circle cx={last.x} cy={last.y} r="9" fill={period_color} opacity=".15" />
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
                  <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                    €{rec.price.toFixed(2)}M
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>
                    {date_label} · {time_label}
                  </div>
                </div>
              );
            })()}
            {price_history !== null && price_history.length === 0 && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", padding: "20px 0", textAlign: "center" }}>
                No price ticks yet for this player.
              </div>
            )}
          </div>
        </div>

        {/* Activity feed — title sticky, only the entries scroll */}
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
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Activity
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.25)" }}>
              {comments === null ? "loading…" : `${comments.length} entries`}
            </span>
          </div>
          <div
            className="scroll-visible"
            style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}
          >
              {comments === null && (
                <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                  loading commentary feed…
                </div>
              )}
              {comments !== null && comments.length === 0 && (
                <div style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                  No commentary entries for this player in the active season.
                </div>
              )}
              {comments?.map(c => {
                const minute_label = c.extra_minute ? `${c.minute}+${c.extra_minute}'` : `${c.minute}'`;
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 8px",
                      borderRadius: 8,
                      borderBottom: "1px solid rgba(255,255,255,.03)",
                      background: c.is_goal ? "rgba(72,255,67,.06)" : "transparent",
                    }}
                  >
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 700, minWidth: 36 }}
                    >
                      {minute_label}
                    </span>
                    <span style={{ fontSize: 16, minWidth: 22, marginTop: 1 }}>{comment_icon(c)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.45, color: "rgba(255,255,255,.85)" }}>
                        {c.comment}
                      </div>
                    </div>
                    {c.is_goal && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          color: "#216c6e",
                          background: "rgba(72,255,67,.12)",
                          padding: "3px 8px",
                          borderRadius: 4,
                          letterSpacing: 0.6,
                          flexShrink: 0,
                        }}
                      >
                        GOAL
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: KPIs + bio + trade flow */}
        <div
          style={{
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflowY: "auto",
            maxHeight: "92vh",
          }}
        >
          <button
            onClick={() => toggle_watch?.(player.id)}
            style={{
              alignSelf: "flex-end",
              width: 36,
              height: 36,
              borderRadius: 8,
              background: is_watched ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.06)",
              color: is_watched ? "#fff" : "rgba(255,255,255,.35)",
              cursor: "pointer",
              fontSize: 16,
              fontFamily: "inherit",
            }}
          >
            {is_watched ? "★" : "☆"}
          </button>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
              About
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.7)", lineHeight: 1.6 }}>
              {player.bio ?? synthesize_bio(player, team.name, team.confederation)}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <SmallKpi label="Value" value={`€${current_price}M`} />
            <SmallKpi
              label="24h"
              value={`${change_24h >= 0 ? "+" : ""}${change_24h}%`}
              color={change_24h >= 0 ? "#216c6e" : "#E41541"}
            />
            <SmallKpi label="Rating" value={String(performance_rating)} color="rgba(255,255,255,.7)" />
            <SmallKpi label="Position" value={POSITION_LABEL[player.position]} mono={false} />
            <SmallKpi label="Age" value={String(player.age ?? "—")} />
            <SmallKpi label="Foot" value={player.foot ?? "—"} mono={false} />
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {[
              { label: "Height", value: player.height ?? "—" },
              { label: "Weight", value: player.weight ?? "—" },
            ].map(s => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,.02)",
                  border: "1px solid rgba(255,255,255,.04)",
                  borderRadius: 8,
                  padding: "8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {(player.tags && player.tags.length > 0 ? player.tags : pick_skills(player)).map(t => (
              <span
                key={t}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.7)",
                  border: "1px solid rgba(255,255,255,.06)",
                }}
              >
                {t}
              </span>
            ))}
          </div>

          <YourPositionCard player={player} current_price={current_price} />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => set_trade_dialog_kind("buy")}
              style={{
                flex: 1,
                padding: "13px 0",
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                background: "#5CF26C",
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
              onClick={() => set_trade_dialog_kind("sell")}
              style={{
                flex: 1,
                padding: "13px 0",
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                background: "#F41258",
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
    </Sheet>
  );
}

function YourPositionCard({ player, current_price }: { player: Player; current_price: number }) {
  const holding = portfolio_api.get_holding(player.id);
  const totals = portfolio_api.get_totals();

  if (!holding || holding.shares === 0) {
    return (
      <div
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid rgba(255,255,255,.05)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid rgba(255,255,255,.04)",
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
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)" }}>— Not held</span>
        </div>
        <div style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,.4)", lineHeight: 1.5 }}>
          You don't hold this player. Use the trade panel below to open a position.
        </div>
      </div>
    );
  }

  const market_value = holding.shares * current_price;
  const cost_basis = holding.shares * holding.average_buy_price;
  const pnl = market_value - cost_basis;
  const return_pct = cost_basis === 0 ? 0 : (pnl / cost_basis) * 100;
  const portfolio_pct = totals.total_value === 0 ? 0 : (market_value / totals.total_value) * 100;
  const is_long = holding.shares > 0;
  const accent = is_long ? "#216c6e" : "#E41541";

  return (
    <div
      style={{
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,.04)",
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
            color: accent,
            background: is_long ? "rgba(55,255,99,.1)" : "rgba(255,40,93,.1)",
            padding: "3px 8px",
            borderRadius: 4,
            letterSpacing: 0.5,
          }}
        >
          {is_long ? "📈 LONG" : "📉 SHORT"}
        </span>
      </div>
      <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <PositionStat label="Shares" value={String(Math.abs(holding.shares))} />
        <PositionStat label="Avg buy" value={`€${holding.average_buy_price}M`} />
        <PositionStat label="Market value" value={fmt_eur_m(market_value)} />
        <PositionStat
          label="P&L"
          value={fmt_eur_m_signed(pnl)}
          color={pnl >= 0 ? "#216c6e" : "#E41541"}
        />
        <PositionStat
          label="Return"
          value={`${return_pct >= 0 ? "+" : ""}${return_pct.toFixed(1)}%`}
          color={return_pct >= 0 ? "#216c6e" : "#E41541"}
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
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
        {label}
      </div>
      <div
        className={mono ? "mono" : ""}
        style={{ fontSize: 15, fontWeight: 800, color: color ?? "#fff", marginTop: 2 }}
      >
        {value}
      </div>
    </div>
  );
}
