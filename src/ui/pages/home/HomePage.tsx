import { useMemo } from "react";
import { matches_api } from "@/api/matches_api";
import { players_api } from "@/api/players_api";
import { portfolio_api } from "@/api/portfolio_api";
import { teams_api } from "@/api/teams_api";
import { leagues_api } from "@/api/leagues_api";
import type { Match } from "@/domain/match/match";
import type { Player } from "@/domain/player/player";
import { LiveBadge } from "@/ui/components/LiveBadge";
import { PerformanceChart } from "@/ui/components/PerformanceChart";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { SectionHeader } from "@/ui/components/SectionHeader";
import { Spark } from "@/ui/components/Spark";
import { gen_spark } from "@/ui/helpers/chart_utils";

interface MarketNewsItem {
  icon: string;
  text: string;
  player_name: string;
  impact: string;
  color: string;
  player_id: number;
  time_ago: string;
}

const MARKET_NEWS: MarketNewsItem[] = [
  { icon: "🏥", text: "Salah limping in training — Egypt camp concerned", player_name: "Salah", impact: "-3.2%", color: "#ff285d", player_id: 38, time_ago: "12m ago" },
  { icon: "⚡", text: "Yamal named in ESPN Best XI — social media surge", player_name: "Yamal", impact: "+2.1%", color: "#37ff63", player_id: 16, time_ago: "1h ago" },
  { icon: "💬", text: "Mbappé confirmed as captain for Colombia clash", player_name: "Mbappé", impact: "+0.8%", color: "#37ff63", player_id: 7, time_ago: "3h ago" },
  { icon: "📊", text: "Haaland tops expected goals chart after Norway win", player_name: "Haaland", impact: "+1.4%", color: "#37ff63", player_id: 26, time_ago: "5h ago" },
];

const HERO_CHART_DATA = Array.from({ length: 60 }, (_, i) => ({
  v: Math.round(10000 + Math.sin(i / 8) * 600 + i * 80 + Math.sin(i * 1.3) * 150),
}));

interface HomePageProps {
  on_open_player: (player: Player) => void;
  on_navigate_tab: (tab: string) => void;
  on_open_match: (match: Match) => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function HomePage({ on_open_player, on_navigate_tab, on_open_match }: HomePageProps) {
  const totals = portfolio_api.get_totals();
  const holdings_count = portfolio_api.get_holdings().length;
  const live = matches_api.get_live_match();
  const upcoming = matches_api.list_fixtures().filter(f => f.status === "upcoming").slice(0, 3);
  const my_leagues = leagues_api.list();

  const all_movers = useMemo(() => players_api.list(), []);
  const top_up = useMemo(() => [...all_movers].sort((a, b) => b.change_24h - a.change_24h).slice(0, 3), [all_movers]);
  const top_down = useMemo(() => [...all_movers].sort((a, b) => a.change_24h - b.change_24h).slice(0, 3), [all_movers]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fu .3s ease" }}>
      {/* Portfolio hero */}
      <div
        style={{
          background: "rgba(255,255,255,.025)",
          border: "1px solid rgba(255,255,255,.06)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <SectionHeader
          title="Portfolio"
          cta="Open →"
          on_cta={() => on_navigate_tab("portfolio")}
        />
        <div
          onClick={() => on_navigate_tab("portfolio")}
          style={{
            padding: "18px 22px",
            cursor: "pointer",
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: 24,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1.5 }}>
                €{(totals.total_value / 1000).toFixed(1)}k
              </span>
              <span className={"ch " + (totals.return_pct >= 0 ? "cu" : "cn")} style={{ fontSize: 13 }}>
                {totals.return_pct >= 0 ? "+" : ""}{totals.return_pct.toFixed(1)}%
              </span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginBottom: 14 }}>
              P&L {totals.pnl >= 0 ? "+" : ""}€{(totals.pnl / 1000).toFixed(1)}k · {holdings_count} holdings
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <Stat label="Rank" value="#3" />
              <Stat label="Best trade" value="+12.4%" color="#37ff63" />
              <Stat label="Win rate" value="68%" />
            </div>
          </div>
          <div style={{ height: 130 }}>
            <PerformanceChart data={HERO_CHART_DATA} width={520} height={130} />
          </div>
        </div>
      </div>

      {/* Match Center + Leagues */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>
        {/* Match Center */}
        <div
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 14,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SectionHeader title="Match Center" cta="All fixtures →" on_cta={() => on_navigate_tab("fixtures")} />

          {live ? (
            <LiveMatchCard match={live} on_open={() => on_open_match(live)} />
          ) : (
            <div
              style={{
                padding: "20px 18px",
                fontSize: 12,
                color: "rgba(255,255,255,.4)",
                background: "rgba(255,255,255,.015)",
                borderBottom: "1px solid rgba(255,255,255,.04)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(255,255,255,.2)",
                }}
              />
              No match in progress right now
            </div>
          )}

          <div style={{ padding: "12px 18px 4px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", letterSpacing: 0.5, textTransform: "uppercase" }}>
            Up next
          </div>
          {upcoming.map((fx, i) => {
            const home = teams_api.get(fx.home_team_id);
            const away = teams_api.get(fx.away_team_id);
            if (!home || !away) return null;
            return (
              <div
                key={fx.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "84px 1fr 28px 1fr",
                  alignItems: "center",
                  padding: "10px 18px",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,.03)" : "none",
                  fontSize: 13,
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontWeight: 600, letterSpacing: 0.3 }}>
                  {fx.date} · 21:00
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <span style={{ fontWeight: 600 }}>{home.name}</span>
                  <span style={{ fontSize: 18 }}>{home.flag}</span>
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,.2)", fontWeight: 600, textAlign: "center" }}>vs</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{away.flag}</span>
                  <span style={{ fontWeight: 600 }}>{away.name}</span>
                </span>
              </div>
            );
          })}
          {upcoming.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.3)" }}>
              No upcoming fixtures scheduled
            </div>
          )}
        </div>

        {/* Leagues */}
        <div
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 14,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SectionHeader title="Your leagues" cta="See all →" on_cta={() => on_navigate_tab("leagues")} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {my_leagues.map((l, i) => {
              const me = l.leaderboard.find(e => e.is_me);
              if (!me) return null;
              return (
                <div
                  key={l.id}
                  onClick={() => on_navigate_tab("leagues")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 18px",
                    borderTop: i > 0 ? "1px solid rgba(255,255,255,.03)" : "none",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 22 }}>{l.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                      {l.member_count} {l.is_public ? "players" : "members"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 800 }}>#{me.rank}</div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: me.return_pct >= 0 ? "#37ff63" : "#ff285d" }}>
                      {me.return_pct >= 0 ? "+" : ""}{me.return_pct}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top up / Top down */}
      <div
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid rgba(255,255,255,.05)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <SectionHeader title="Movers · 24h" cta="Open screener →" on_cta={() => on_navigate_tab("screener")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <MoversColumn label="Top gainers" players={top_up} on_open_player={on_open_player} />
          <MoversColumn label="Top losers" players={top_down} on_open_player={on_open_player} divider />
        </div>
      </div>

      {/* Market news */}
      <div
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid rgba(255,255,255,.05)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <SectionHeader title="Market news" meta="Today" />
        <div>
          {MARKET_NEWS.map((n, i) => (
            <div
              key={i}
              onClick={() => {
                const p = players_api.get(n.player_id);
                if (p) on_open_player(p);
              }}
              style={{
                padding: "14px 18px",
                borderTop: i > 0 ? "1px solid rgba(255,255,255,.04)" : "none",
                cursor: "pointer",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.025)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{n.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,.85)", fontWeight: 500 }}>
                  {n.text}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontWeight: 600 }}>{n.player_name}</span>
                  <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: n.color }}>{n.impact}</span>
                </div>
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", flexShrink: 0, marginTop: 2 }}>{n.time_ago}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveMatchCard({ match, on_open }: { match: Match; on_open: () => void }) {
  const home = teams_api.get(match.home_team_id);
  const away = teams_api.get(match.away_team_id);

  // Top movers in the match
  const movers = useMemo(() => {
    return Object.entries(match.player_changes)
      .map(([id, change]) => ({ id: Number(id), change }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 4);
  }, [match.player_changes]);

  return (
    <div
      onClick={on_open}
      style={{
        padding: "16px 18px",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        borderBottom: "1px solid rgba(255,255,255,.04)",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent)",
          animation: "glow 2s infinite",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <LiveBadge />
        <span className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,.5)", fontWeight: 700 }}>{match.minute}'</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <div style={{ textAlign: "right", flex: 1 }}>
          <div style={{ fontSize: 28 }}>{home?.flag}</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{home?.name}</div>
        </div>
        <div className="mono" style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5 }}>
          {match.home_score} : {match.away_score}
        </div>
        <div style={{ textAlign: "left", flex: 1 }}>
          <div style={{ fontSize: 28 }}>{away?.flag}</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{away?.name}</div>
        </div>
      </div>
      {movers.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12, fontSize: 11, color: "rgba(255,255,255,.45)", flexWrap: "wrap" }}>
          {movers.map(m => {
            const p = players_api.get(m.id);
            return (
              <span key={m.id}>
                {p?.name ?? `#${m.id}`}{" "}
                <span style={{ color: m.change >= 0 ? "#37ff63" : "#ff285d", fontWeight: 700 }}>
                  {m.change >= 0 ? "+" : ""}{m.change}%
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoversColumn({
  label,
  players,
  on_open_player,
  divider,
}: {
  label: string;
  players: Player[];
  on_open_player: (player: Player) => void;
  divider?: boolean;
}) {
  return (
    <div style={{ borderLeft: divider ? "1px solid rgba(255,255,255,.04)" : "none" }}>
      <div style={{ padding: "12px 18px 8px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      {players.map((p, i) => {
        const team = teams_api.get(p.team_id);
        const up = p.change_24h >= 0;
        return (
          <div
            key={p.id}
            onClick={() => on_open_player(p)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 18px",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,.03)" : "none",
              cursor: "pointer",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.025)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <PlayerChip jersey_number={p.jersey_number} team_color={team?.color ?? "#666"} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.name}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                <span>{team?.flag}</span>
                <span>{team?.name}</span>
              </div>
            </div>
            <Spark
              data={gen_spark(p.change_24h, p.id, 14)}
              color={up ? "#37ff63" : "#ff285d"}
              width={56}
              height={22}
            />
            <div style={{ textAlign: "right", minWidth: 64 }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>€{p.value}M</div>
              <div className="mono" style={{ fontSize: 11, fontWeight: 800, color: up ? "#37ff63" : "#ff285d" }}>
                {up ? "+" : ""}{p.change_24h}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,.35)",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: color ?? "#fff" }}>
        {value}
      </div>
    </div>
  );
}

