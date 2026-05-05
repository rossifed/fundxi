import { useEffect, useMemo, useState } from "react";
import { comments_api } from "@/api/comments_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import { valuations_api } from "@/api/valuations_api";
import type { MatchComment } from "@/domain/match/match_comment";
import { POSITION_LABEL, type Player } from "@/domain/player/player";
import { Sheet } from "@/ui/components/Sheet";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { PositionBadge } from "@/ui/components/PositionBadge";
import { TradeDialog } from "@/ui/components/TradeDialog";

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

type Period = "inception" | "30d" | "7d" | "24h" | "live";

interface PriceEvent {
  i: number;
  day: number;
  type: "news" | "game";
  icon: string;
  label: string;
  pct: number;
  price: number;
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

  const [period, set_period] = useState<Period>("30d");
  const [selected_event, set_selected_event] = useState<PriceEvent | null>(null);
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

  const all_events = useMemo<PriceEvent[]>(() => {
    const base = current_price * 0.82;
    return [
      { i: 0, day: 1, type: "news", icon: "📰", label: "Transfer rumours intensify", pct: 2.1, price: Math.round(base * 1.02) },
      { i: 1, day: 5, type: "news", icon: "🏥", label: "Passed fitness test — fully fit", pct: 1.5, price: Math.round(base * 1.035) },
      { i: 2, day: 8, type: "game", icon: "⚽", label: "Goal vs Morocco (Group A, 23')", pct: 4.2, price: Math.round(base * 1.08) },
      { i: 3, day: 10, type: "game", icon: "🅰️", label: "Assist vs Morocco (67')", pct: 1.8, price: Math.round(base * 1.10) },
      { i: 4, day: 12, type: "news", icon: "📊", label: "Named in Team of the Week", pct: 0.8, price: Math.round(base * 1.11) },
      { i: 5, day: 15, type: "game", icon: "🟨", label: "Yellow card vs Mexico (55')", pct: -1.2, price: Math.round(base * 1.09) },
      { i: 6, day: 16, type: "game", icon: "⚽⚽", label: "Brace vs Mexico (71', 84')", pct: 6.5, price: Math.round(base * 1.16) },
      { i: 7, day: 19, type: "news", icon: "🗞️", label: "Manager praises in presser", pct: 0.5, price: Math.round(base * 1.17) },
      { i: 8, day: 22, type: "game", icon: "📉", label: "Poor rating vs Iran (5.8)", pct: -3.1, price: Math.round(base * 1.13) },
      { i: 9, day: 24, type: "news", icon: "💬", label: "Motivated for R16", pct: 0.9, price: Math.round(base * 1.14) },
      { i: 10, day: 26, type: "game", icon: "⚽", label: "Goal vs Colombia (R16, 12')", pct: 3.2, price: Math.round(base * 1.18) },
      { i: 11, day: 27, type: "game", icon: "🌟", label: "MOTM — 9.2 rating", pct: 2.8, price: Math.round(base * 1.21) },
      { i: 12, day: 29, type: "news", icon: "🔥", label: "Trending — hype surge", pct: 1.4, price: Math.round(current_price) },
    ];
  }, [player.id, current_price]);

  const period_ranges: Record<Period, [number, number]> = {
    inception: [0, 30],
    "30d": [0, 30],
    "7d": [23, 30],
    "24h": [28, 30],
    live: [25, 30],
  };
  const [low, high] = period_ranges[period];
  const visible_events = all_events.filter(e => e.day >= low && e.day <= high);

  const chart_points = useMemo(() => {
    const length = period === "inception" ? 90 : period === "30d" ? 60 : period === "7d" ? 28 : period === "24h" ? 48 : 36;
    const base = all_events[0]?.price ?? current_price * 0.82;
    return Array.from({ length }, (_, i) => {
      const d = low + (i / (length - 1)) * (high - low);
      let p = base;
      for (const e of all_events) if (e.day <= d) p = e.price;
      return p + Math.sin(i * (player.id || 1) * 0.4) * current_price * 0.008;
    });
  }, [period, all_events, low, high, player.id, current_price]);

  const period_return =
    chart_points.length > 1 ? ((chart_points[chart_points.length - 1] - chart_points[0]) / chart_points[0]) * 100 : 0;
  const period_is_up = chart_points.length > 1 && chart_points[chart_points.length - 1] >= chart_points[0];
  const period_color = period_is_up ? "#48ff43" : "#ff285d";

  return (
    <Sheet open={true} on_close={on_close} max_width={1080}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(380px, 1fr)", minHeight: 600 }}>
        {/* LEFT: hero + chart + price events */}
        <div
          style={{
            padding: "20px 24px",
            borderRight: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflowY: "auto",
            maxHeight: "92vh",
          }}
        >
          {/* Hero */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <PlayerChip jersey_number={player.jersey_number} team_color={team.color} size={56} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: -0.5 }}>
                {player.full_name ?? player.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <PositionBadge position={player.position} />
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,.45)" }}>
                  <span style={{ fontSize: 14 }}>{team.flag}</span>
                  <span>{team.name} · {player.club ?? "—"}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Chart header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Valuation</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 2 }}>
                {period === "inception" ? "Since inception" : period === "live" ? "Live game" : period === "30d" ? "Last 30 days" : period === "7d" ? "Last 7 days" : "Last 24h"}
              </div>
            </div>
            <span className="mono" style={{ fontSize: 18, fontWeight: 800, color: period_color }}>
              {period_return >= 0 ? "+" : ""}{period_return.toFixed(1)}%
            </span>
          </div>

          {/* Period selector */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["inception", "30d", "7d", "24h", "live"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => {
                  set_period(p);
                  set_selected_event(null);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: period === p ? 700 : 500,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: period === p ? "rgba(255,255,255,.07)" : "transparent",
                  color: period === p ? "#fff" : "rgba(255,255,255,.35)",
                }}
              >
                {p === "inception" ? "All" : p === "live" ? "Game" : p.toUpperCase()}
              </button>
            ))}
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
              const event_points = visible_events.map(e => {
                const frac = (e.day - low) / (high - low);
                const idx = Math.round(frac * (chart_points.length - 1));
                const pt = points[Math.min(idx, points.length - 1)];
                return { ...e, cx: pt.x, cy: pt.y };
              });
              return (
                <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="player_chart_grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={period_color} stopOpacity=".3" />
                      <stop offset="100%" stopColor={period_color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 0.5, 1].map((p, i) => (
                    <line key={i} x1={pd} x2={w - pd} y1={pd + p * (h - pd * 2)} y2={pd + p * (h - pd * 2)} stroke="rgba(255,255,255,.04)" />
                  ))}
                  <polygon points={`${points[0].x},${h - pd} ${polyline} ${last.x},${h - pd}`} fill="url(#player_chart_grad)" />
                  <polyline points={polyline} fill="none" stroke={period_color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity=".1" />
                  <polyline points={polyline} fill="none" stroke={period_color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={last.x} cy={last.y} r="4" fill={period_color} />
                  <circle cx={last.x} cy={last.y} r="9" fill={period_color} opacity=".15" />
                  {selected_event && (() => {
                    const se = event_points.find(e => e.i === selected_event.i);
                    return se ? (
                      <line x1={se.cx} y1={pd} x2={se.cx} y2={h - pd} stroke="rgba(255,255,255,.12)" strokeDasharray="3,2" />
                    ) : null;
                  })()}
                  {event_points.map((e, i) => {
                    const is_sel = selected_event?.i === e.i;
                    return (
                      <g key={i} onClick={() => set_selected_event(is_sel ? null : e)} style={{ cursor: "pointer" }}>
                        <circle cx={e.cx} cy={e.cy} r="14" fill="transparent" />
                        <circle
                          cx={e.cx}
                          cy={e.cy}
                          r={is_sel ? 6 : 4}
                          fill={is_sel ? "#fff" : "rgba(255,255,255,.55)"}
                          stroke="#040810"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
            {selected_event && (
              <div
                style={{
                  marginTop: 8,
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  animation: "fu .12s ease",
                }}
              >
                <span style={{ fontSize: 22 }}>{selected_event.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{selected_event.label}</div>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>
                    Day {selected_event.day} · {selected_event.type === "game" ? "Match" : "News"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Activity feed — real Sportmonks commentary for every action that
              mentions this player, across all his matches in the active season. */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                Activity
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.25)" }}>
                {comments === null ? "loading…" : `${comments.length} entries`}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
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
                const minute_label = c.extra_minute
                  ? `${c.minute}+${c.extra_minute}'`
                  : `${c.minute}'`;
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
                          color: "#48ff43",
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
          {/* Watch toggle */}
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

          {/* KPIs grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <SmallKpi label="Value" value={`€${current_price}M`} />
            <SmallKpi
              label="24h"
              value={`${change_24h >= 0 ? "+" : ""}${change_24h}%`}
              color={change_24h >= 0 ? "#37ff63" : "#ff285d"}
            />
            <SmallKpi label="Rating" value={String(performance_rating)} color="rgba(255,255,255,.7)" />
            <SmallKpi label="Position" value={POSITION_LABEL[player.position]} mono={false} />
            <SmallKpi label="Age" value={String(player.age ?? "—")} />
            <SmallKpi label="Foot" value={player.foot ?? "—"} mono={false} />
          </div>

          {/* Bio */}
          {player.bio && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
                Bio
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.6 }}>{player.bio}</p>
            </div>
          )}

          {/* Tags */}
          {player.tags && player.tags.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
                Skills
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {player.tags.map(t => (
                  <span
                    key={t}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "rgba(255,255,255,.04)",
                      color: "rgba(255,255,255,.55)",
                      border: "1px solid rgba(255,255,255,.06)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Physical */}
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

          {/* Your position */}
          <YourPositionCard player={player} current_price={current_price} />

          {/* Trade actions — open dedicated dialog */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => set_trade_dialog_kind("buy")}
              style={{
                flex: 1,
                padding: "13px 0",
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                background: "linear-gradient(135deg,#22c55e,#16a34a)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 4px 16px rgba(34,197,94,.2)",
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
                background: "rgba(255,40,93,.1)",
                color: "#ff285d",
                border: "1px solid rgba(255,40,93,.25)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Sell
            </button>
          </div>
        </div>
      </div>

      {/* Trade dialog stacks on top of the player sheet */}
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
  const accent = is_long ? "#37ff63" : "#ff285d";

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
        <PositionStat label="Market value" value={`€${(market_value / 1000).toFixed(1)}k`} />
        <PositionStat
          label="P&L"
          value={`${pnl >= 0 ? "+" : ""}€${(pnl / 1000).toFixed(2)}k`}
          color={pnl >= 0 ? "#37ff63" : "#ff285d"}
        />
        <PositionStat
          label="Return"
          value={`${return_pct >= 0 ? "+" : ""}${return_pct.toFixed(1)}%`}
          color={return_pct >= 0 ? "#37ff63" : "#ff285d"}
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
