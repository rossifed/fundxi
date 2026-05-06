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
  const period_return =
    chart_points.length > 1
      ? ((chart_points[chart_points.length - 1] - chart_points[0]) / chart_points[0]) * 100
      : 0;
  const period_is_up = chart_points.length > 1 && chart_points[chart_points.length - 1] >= chart_points[0];
  const period_color = period_is_up ? "#48ff43" : "#ff285d";

  return (
    <Sheet open={true} on_close={on_close} max_width={1080}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(380px, 1fr)", minHeight: 600 }}>
        {/* LEFT: hero + chart + activity feed */}
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
                {price_history === null
                  ? "loading…"
                  : price_history.length === 0
                    ? "No price ticks yet"
                    : `Tournament — ${price_history.length} ticks`}
              </div>
            </div>
            <span className="mono" style={{ fontSize: 18, fontWeight: 800, color: period_color }}>
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
              return (
                <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="player_chart_grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={period_color} stopOpacity=".3" />
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
                </svg>
              );
            })()}
            {price_history !== null && price_history.length === 0 && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", padding: "20px 0", textAlign: "center" }}>
                No price ticks yet for this player.
              </div>
            )}
          </div>

          {/* Activity feed — real Sportmonks commentary */}
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

          {player.bio && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
                Bio
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.6 }}>{player.bio}</p>
            </div>
          )}

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
        <PositionStat label="Market value" value={fmt_eur_m(market_value)} />
        <PositionStat
          label="P&L"
          value={fmt_eur_m_signed(pnl)}
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
