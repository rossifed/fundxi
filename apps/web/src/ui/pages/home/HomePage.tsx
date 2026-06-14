import { useMemo, useState } from "react";
import { color_for_sign, fmt_fixture_datetime } from "@/ui/helpers/format";
import { compute_return_pct } from "@fundxi/core/domain/market/return";
import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { leagues_api } from "@fundxi/core/api/leagues_api";
import type { Match } from "@fundxi/core/domain/match/match";
import { default_match_tab, latest_results, next_fixtures, type MatchTab } from "@fundxi/core/domain/match/match_center";
import type { Player } from "@fundxi/core/domain/player/player";
import type { PlayerWithValuation } from "@fundxi/core/domain/market/player_valuation";
import { Logo } from "@/ui/shell/Logo";
import { LiveBadge } from "@/ui/components/LiveBadge";
import { PlayerAvatar } from "@/ui/components/PlayerAvatar";
import { SectionHeader } from "@/ui/components/SectionHeader";
import { Spark } from "@/ui/components/Spark";
import { TeamLink } from "@/ui/components/TeamLink";
import { TickValue } from "@/ui/components/TickValue";
import { spark_for_player } from "@fundxi/core/infrastructure/repositories/valuations_repository";
import { news_api } from "@fundxi/core/api/news_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import {
  useLiveRefetch,
  usePricesLiveVersion,
} from "@/ui/hooks/use_live_updates";
import { useLiveMatch } from "@/ui/hooks/use_live_match";
import { useViewport } from "@/ui/hooks/use_viewport";

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
  on_open_team?: (team_id: string) => void;
  watchlist?: Set<number>;
  toggle_watch?: (id: number) => void;
}

export function HomePage({ on_open_player, on_navigate_tab, on_open_match, on_open_team }: HomePageProps) {
  const { is_mobile } = useViewport();
  // The Match Center card mirrors the in-play match via the shared
  // useLiveMatch hook — the SAME source/refresh path the RightRail ticker
  // uses, so the minute/score can never diverge between widgets/pages.
  const live = useLiveMatch();
  // Match Center toggle: the live match (if any) stays a persistent card above
  // a Next | Latest toggle. "Latest" surfaces overnight / earlier-today scores
  // without going to Fixtures; the default tab is contextual (see core).
  const all_fixtures = matches_api.list_fixtures();
  const upcoming = next_fixtures(all_fixtures, 2);
  const recent = latest_results(all_fixtures, 2);
  const [match_tab, set_match_tab] = useState<MatchTab>(() => default_match_tab(all_fixtures, Date.now()));
  const my_leagues = leagues_api.list_summaries();

  // Top gainers / losers: re-read after every live price tick.
  const prices_version = usePricesLiveVersion();
  const [valuations_version, set_valuations_version] = useState(0);
  useLiveRefetch(prices_version, () => {
    void valuations_api.refresh().then(() => set_valuations_version(v => v + 1));
  });
  const top_up = useMemo(() => players_api.top_movers(5, "up"), [valuations_version]);
  const top_down = useMemo(() => players_api.top_movers(5, "down"), [valuations_version]);
  // Gainers | Losers toggle (one list at a time), mirroring the native Home.
  const [movers_dir, set_movers_dir] = useState<"up" | "down">("up");

  // Open a fixture's MatchView from its id, reusing the same fixture_id → Match
  // path as the Fixtures page. Shared by the news rows and the Latest results
  // rows. A missing fixture (league-level news) is a no-op.
  const open_fixture = async (fixture_id: number | undefined) => {
    if (fixture_id === undefined) return;
    const match = await matches_api.get_match_by_fixture_id(fixture_id);
    if (match) on_open_match(match);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fu .3s ease" }}>
      {/* Hero — only on Home, signals "welcome" */}
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginBottom: 8,
          marginTop: 4,
        }}
      >
        <Logo size={52} tagline />
      </header>

      {/* Match Center + Leagues — side by side on desktop; on a phone the
          Match Center takes the full width and Leagues stacks below it so the
          match rows aren't squeezed. */}
      <div style={{ display: "grid", gridTemplateColumns: is_mobile ? "1fr" : "3fr 2fr", gap: 16 }}>
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
            <LiveMatchCard match={live} on_open={() => on_open_match(live)} on_open_team={on_open_team} />
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

          {/* Next | Latest toggle — the live match (above) is never tabbed. */}
          <div style={{ display: "flex", gap: 4, padding: "12px 18px 8px" }}>
            {(["next", "latest"] as const).map(t => {
              const active = match_tab === t;
              return (
                <button
                  key={t}
                  onClick={() => set_match_tab(t)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: active ? "#fff" : "rgba(255,255,255,.4)",
                    background: active ? "rgba(255,255,255,.06)" : "transparent",
                    border: "1px solid",
                    borderColor: active ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  {t === "next" ? "Next" : "Latest"}
                </button>
              );
            })}
          </div>

          {(match_tab === "latest" ? recent : upcoming).map((fx, i) => {
            const home = teams_api.get(fx.home_team_id);
            const away = teams_api.get(fx.away_team_id);
            if (!home || !away) return null;
            const is_result = match_tab === "latest";
            const row_base: React.CSSProperties = {
              padding: "10px 18px",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,.03)" : "none",
              fontSize: 13,
              cursor: "pointer",
            };
            const home_label = (
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                <span style={{ fontWeight: 600 }}>{home.name}</span>
                <span style={{ fontSize: 18 }}>{home.flag}</span>
              </span>
            );
            const away_label = (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{away.flag}</span>
                <span style={{ fontWeight: 600 }}>{away.name}</span>
              </span>
            );
            const hover_in = (e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.background = "rgba(255,255,255,.02)");
            const hover_out = (e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.background = "transparent");

            // Result rows keep the score line; upcoming rows centre the teams
            // and put the kickoff date/time small underneath them.
            return is_result ? (
              <div
                key={fx.id}
                onClick={() => void open_fixture(fx.id)}
                role="button"
                title="Open match"
                style={{ ...row_base, display: "grid", gridTemplateColumns: "44px 1fr 44px 1fr", alignItems: "center", gap: 10 }}
                onMouseEnter={hover_in}
                onMouseLeave={hover_out}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: 0.5 }}>FT</span>
                {home_label}
                <span className="mono" style={{ fontSize: 13, fontWeight: 800, textAlign: "center" }}>
                  {fx.home_score ?? 0}–{fx.away_score ?? 0}
                </span>
                {away_label}
              </div>
            ) : (
              <div
                key={fx.id}
                onClick={() => void open_fixture(fx.id)}
                role="button"
                title="Open match"
                style={{ ...row_base, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                onMouseEnter={hover_in}
                onMouseLeave={hover_out}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 1fr", alignItems: "center", gap: 10, width: "100%" }}>
                  {home_label}
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.2)", fontWeight: 600, textAlign: "center" }}>vs</span>
                  {away_label}
                </div>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,.4)", fontWeight: 600, letterSpacing: 0.3 }}>
                  {fmt_fixture_datetime(fx.date)}
                </span>
              </div>
            );
          })}
          {match_tab === "next" && upcoming.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.3)" }}>
              No upcoming fixtures scheduled
            </div>
          )}
          {match_tab === "latest" && recent.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.3)" }}>
              No matches played yet
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
            {my_leagues.length === 0 && (
              <div
                style={{
                  padding: "18px 20px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "rgba(255,255,255,.35)",
                  lineHeight: 1.5,
                }}
              >
                You have not joined any league yet.
              </div>
            )}
            {my_leagues.map((l, i) => (
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
                  <div className="mono" style={{ fontSize: 16, fontWeight: 800 }}>{l.my_rank}</div>
                  <div
                    className="mono"
                    style={{ fontSize: 11, fontWeight: 700, color: color_for_sign(l.my_return_pct) }}
                  >
                    {l.my_return_pct >= 0 ? "+" : ""}
                    {l.my_return_pct}%
                  </div>
                </div>
              </div>
            ))}
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
        {/* Gainers | Losers toggle — one list at a time, same section, on every
            device (mirrors the native Home). Reuses the Match Center toggle
            look for consistency. */}
        <div style={{ display: "flex", gap: 4, padding: "12px 18px 8px" }}>
          {([["up", "Gainers"], ["down", "Losers"]] as const).map(([dir, label]) => {
            const active = movers_dir === dir;
            return (
              <button
                key={dir}
                onClick={() => set_movers_dir(dir)}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: active ? "#fff" : "rgba(255,255,255,.4)",
                  background: active ? "rgba(255,255,255,.06)" : "transparent",
                  border: "1px solid",
                  borderColor: active ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <MoversColumn
          players={movers_dir === "up" ? top_up : top_down}
          on_open_player={on_open_player}
          on_open_team={on_open_team}
        />
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
              onClick={n.fixture_id !== undefined ? () => void open_fixture(n.fixture_id) : undefined}
              role={n.fixture_id !== undefined ? "button" : undefined}
              title={n.fixture_id !== undefined ? "Open match" : undefined}
              style={{
                padding: "14px 18px",
                borderTop: i > 0 ? "1px solid rgba(255,255,255,.04)" : "none",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                cursor: n.fixture_id !== undefined ? "pointer" : "default",
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

// Surname only (last whitespace token) — keeps each scorer compact so the
// minute stays on the same line.
function _surname(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : full;
}

interface _ScorerEntry {
  name: string;
  own: boolean;
  team_id: string;
  mins: string[];
}

// One team's scorers, stacked and left-anchored ("⚽ Surname 9', 67'" per line).
function _ScorerList({ scorers, color }: { scorers: _ScorerEntry[]; color?: string }) {
  if (scorers.length === 0) return <div />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "rgba(255,255,255,.5)", textAlign: "left", minWidth: 0 }}>
      {scorers.map((s, i) => (
        <div key={`${s.name}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            ⚽ <span style={{ color: color ?? "rgba(255,255,255,.8)", fontWeight: 700 }}>{_surname(s.name)}</span>
            {s.own ? <span style={{ opacity: 0.7, fontWeight: 700 }}> (og)</span> : null}
          </span>
          <span className="mono" style={{ flexShrink: 0, fontWeight: 700 }}>{s.mins.join(", ")}</span>
        </div>
      ))}
    </div>
  );
}

function LiveMatchCard({
  match,
  on_open,
  on_open_team,
}: {
  match: Match;
  on_open: () => void;
  on_open_team?: (team_id: string) => void;
}) {
  const home = teams_api.get(match.home_team_id);
  const away = teams_api.get(match.away_team_id);

  // Scorers grouped by player so a brace sits on ONE line ("Quiñones 9', 67'")
  // and the surname + minute never split across lines.
  const scorers = useMemo(() => {
    const goals = match.events.filter(e => _GOAL_GLYPHS.has(e.type)).slice().sort((a, b) => a.minute - b.minute);
    const by: { name: string; own: boolean; team_id: string; mins: string[] }[] = [];
    for (const g of goals) {
      const name = g.player_name ?? "?";
      const own = g.is_own_goal === true;
      const min = `${g.minute}'${g.type === "🎯" ? " (p)" : ""}`;
      const row = by.find(s => s.name === name && s.own === own && s.team_id === g.team_id);
      if (row) row.mins.push(min);
      else by.push({ name, own, team_id: g.team_id ?? "", mins: [min] });
    }
    return by;
  }, [match.events]);

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
          <TeamLink team_id={match.home_team_id} on_open_team={on_open_team} style={{ display: "block" }}>
            <div style={{ fontSize: 28 }}>{home?.flag}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{home?.name}</div>
          </TeamLink>
        </div>
        <div className="mono" style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5 }}>
          {match.home_score} : {match.away_score}
        </div>
        <div style={{ textAlign: "left", flex: 1 }}>
          <TeamLink team_id={match.away_team_id} on_open_team={on_open_team} style={{ display: "block" }}>
            <div style={{ fontSize: 28 }}>{away?.flag}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{away?.name}</div>
          </TeamLink>
        </div>
      </div>
      {scorers.length > 0 && (
        // Each team's scorers under its own half, left-anchored — so it's clear
        // who scored for whom (mirrors the native match scorer split).
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
          <_ScorerList scorers={scorers.filter(s => s.team_id === match.home_team_id)} color={home?.color} />
          <_ScorerList scorers={scorers.filter(s => s.team_id === match.away_team_id)} color={away?.color} />
        </div>
      )}
    </div>
  );
}

// The Gainers / Losers list for the Top movers section. Which list is shown
// is driven by the section's toggle, so the column itself carries no label.
function MoversColumn({
  players,
  on_open_player,
  on_open_team,
}: {
  players: PlayerWithValuation[];
  on_open_player: (player: Player) => void;
  on_open_team?: (team_id: string) => void;
}) {
  return (
    <div>
      {players.map((p, i) => {
        const team = teams_api.get(p.team_id);
        const tournament_return = compute_return_pct(p.valuation.current_price, p.valuation.base_value);
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
            <PlayerAvatar
              image_path={p.image_path}
              size={34}
              radius={7}
              fit="contain"
              alt={p.full_name ?? p.name}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.4)", flexShrink: 0 }}>
                  {p.jersey_number}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  {p.name}
                </span>
              </div>
              <TeamLink
                team_id={p.team_id}
                on_open_team={on_open_team}
                style={{ fontSize: 10, color: "rgba(255,255,255,.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}
              >
                <span>{team?.flag}</span>
                <span>{team?.name}</span>
              </TeamLink>
            </div>
            <Spark
              data={spark_for_player(p.id)}
              width={56}
              height={22}
            />
            <div style={{ textAlign: "right", minWidth: 64 }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                <TickValue value={p.valuation.current_price}>€{p.valuation.current_price}M</TickValue>
              </div>
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

