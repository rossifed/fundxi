import { useMemo, useState } from "react";
import { matches_api } from "@/api/matches_api";
import { players_api } from "@/api/players_api";
import { teams_api } from "@/api/teams_api";
import { leagues_api } from "@/api/leagues_api";
import type { Match } from "@/domain/match/match";
import type { Player } from "@/domain/player/player";
import type { PlayerWithValuation } from "@/domain/market/player_valuation";
import { LiveBadge } from "@/ui/components/LiveBadge";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { SectionHeader } from "@/ui/components/SectionHeader";
import { Spark } from "@/ui/components/Spark";
import { spark_for_player } from "@/infrastructure/repositories/valuations_repository";
import { news_api } from "@/api/news_api";
import { valuations_api } from "@/api/valuations_api";
import {
  useFixtureLiveVersion,
  useLiveRefetch,
  useMatchesLiveVersion,
  usePricesLiveVersion,
} from "@/ui/hooks/use_live_updates";

function news_icon(type: "prematch" | "postmatch"): string {
  return type === "postmatch" ? "🏁" : "📰";
}

// Hero performance chart data: real "market index" derived from the
// valuation engine — average of every player's price (normalized to 100
// at tournament start). Recomputed on every render but the underlying
// sparklines are cached in the repository.

interface HomePageProps {
  on_open_player: (player: Player) => void;
  on_navigate_tab: (tab: string) => void;
  on_open_match: (match: Match) => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function HomePage({ on_open_player, on_navigate_tab, on_open_match }: HomePageProps) {
  // The Match Center card mirrors the in-play match. Seeded from the boot-time
  // snapshot; kept in step (clock / score / scorers) by the fixture SSE stream,
  // and the global "matches" stream lets it appear when a match goes live mid-
  // session (and clears it when there's no live match).
  const [live, set_live] = useState<Match | null>(() => matches_api.get_live_match() ?? null);
  const live_version = useFixtureLiveVersion(live?.fixture_id);
  useLiveRefetch(live_version, () => {
    if (!live?.fixture_id) return;
    matches_api
      .refresh_match_by_fixture_id(live.fixture_id)
      .then(m => set_live(m && m.status === "live" ? m : null))
      .catch(() => {
        /* keep the current card on a transient error */
      });
  });
  const matches_version = useMatchesLiveVersion();
  useLiveRefetch(matches_version, () => {
    if (live) return; // already showing one; the per-fixture stream handles updates
    matches_api
      .refresh_fixtures()
      .then(fixtures => {
        const live_fixture = fixtures.find(f => f.status === "live");
        if (!live_fixture) return;
        matches_api
          .refresh_match_by_fixture_id(live_fixture.id)
          .then(m => set_live(m && m.status === "live" ? m : null))
          .catch(() => {});
      })
      .catch(() => {});
  });
  const upcoming = matches_api.list_fixtures().filter(f => f.status === "upcoming").slice(0, 3);
  const my_leagues = leagues_api.list();

  // Top gainers / losers: re-read after every live price tick.
  const prices_version = usePricesLiveVersion();
  const [valuations_version, set_valuations_version] = useState(0);
  useLiveRefetch(prices_version, () => {
    void valuations_api.refresh().then(() => set_valuations_version(v => v + 1));
  });
  const top_up = useMemo(() => players_api.top_movers(5, "up"), [valuations_version]);
  const top_down = useMemo(() => players_api.top_movers(5, "down"), [valuations_version]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fu .3s ease" }}>
      {/* Hero — only on Home, signals "welcome" */}
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 18,
          marginBottom: 8,
          marginTop: 4,
        }}
      >
        <h1
          style={{
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: -2.2,
            lineHeight: 1,
            margin: 0,
            background:
              "linear-gradient(135deg, rgba(255,255,255,.95) 0%, rgba(255,255,255,.55) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Fund<span style={{ color: "var(--color-accent)", WebkitTextFillColor: "var(--color-accent)", background: "none" }}>XI</span>
        </h1>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "rgba(255,255,255,.4)",
            letterSpacing: 0.3,
            fontStyle: "italic",
            paddingBottom: 4,
          }}
        >
          Trade the game.
        </span>
      </header>

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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                      {l.member_count} {l.is_public ? "players" : "members"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 800 }}>{me.rank}</div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: me.return_pct >= 0 ? "var(--color-positive)" : "var(--color-negative)" }}>
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
        <SectionHeader title="Top movers · since tournament start" cta="Open screener →" on_cta={() => on_navigate_tab("screener")} />
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
          {news_api.list().slice(0, 6).map((n, i) => (
            <div
              key={n.id}
              style={{
                padding: "14px 18px",
                borderTop: i > 0 ? "1px solid rgba(255,255,255,.04)" : "none",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{news_icon(n.type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,.85)", fontWeight: 500 }}>
                  {n.title}
                </div>
                {n.fixture_label && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontWeight: 600 }}>
                      {n.fixture_label}
                    </span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", flexShrink: 0, marginTop: 2 }}>
                {n.type === "prematch" ? "pre-match" : "post-match"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// MatchEvent.type comes from the BFF as the display glyph: "⚽" for a goal
// (and own-goal — the BFF collapses both), "🎯" for a scored penalty.
const _GOAL_GLYPHS = new Set(["⚽", "🎯"]);

function LiveMatchCard({ match, on_open }: { match: Match; on_open: () => void }) {
  const home = teams_api.get(match.home_team_id);
  const away = teams_api.get(match.away_team_id);

  // Scorers, in chronological order — name + minute.
  const goals = useMemo(
    () =>
      match.events
        .filter(e => _GOAL_GLYPHS.has(e.type))
        .slice()
        .sort((a, b) => a.minute - b.minute),
    [match.events],
  );

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
      {goals.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12, fontSize: 11, color: "rgba(255,255,255,.45)", flexWrap: "wrap" }}>
          {goals.map((g, i) => {
            const color = g.team_id === match.home_team_id ? home?.color : away?.color;
            return (
              <span key={`${g.minute}-${g.player_name ?? "?"}-${i}`}>
                ⚽{" "}
                <span style={{ color: color ?? "rgba(255,255,255,.8)", fontWeight: 700 }}>{g.player_name ?? "?"}</span>
                {g.type === "🎯" ? " (p)" : ""}{" "}
                <span className="mono" style={{ fontWeight: 700 }}>{g.minute}'</span>
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
  players: PlayerWithValuation[];
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
        const tournament_return =
          p.valuation.base_value > 0
            ? ((p.valuation.current_price - p.valuation.base_value) / p.valuation.base_value) * 100
            : 0;
        const up = tournament_return >= 0;
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
            {p.image_path ? (
              <img
                src={p.image_path}
                alt={p.full_name ?? p.name}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 7,
                  objectFit: "contain",
                  background: "rgba(255,255,255,.05)",
                  border: "1px solid rgba(255,255,255,.08)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <PlayerChip jersey_number={p.jersey_number} team_color={team?.color ?? "#666"} size={34} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", flexShrink: 0 }}>
                  {p.jersey_number}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  {p.name}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                <span>{team?.flag}</span>
                <span>{team?.name}</span>
              </div>
            </div>
            <Spark
              data={spark_for_player(p.id)}
              width={56}
              height={22}
            />
            <div style={{ textAlign: "right", minWidth: 64 }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>€{p.valuation.current_price}M</div>
              <div className="mono" style={{ fontSize: 11, fontWeight: 800, color: up ? "var(--color-positive)" : "var(--color-negative)" }}>
                {up ? "+" : ""}{tournament_return.toFixed(1)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function _UnusedStat({ label, value, color }: { label: string; value: string; color?: string }) {
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

