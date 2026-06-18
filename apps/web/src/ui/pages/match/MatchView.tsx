import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { Match, MatchEvent, MatchPlayer } from "@fundxi/core/domain/match/match";
import type { Team } from "@fundxi/core/domain/team/team";
import type { MatchComment } from "@fundxi/core/domain/match/match_comment";
import type { Position } from "@fundxi/core/domain/player/player";
import { comments_api } from "@fundxi/core/api/comments_api";
import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { team_stats_api } from "@fundxi/core/api/team_stats_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import type { TeamMatchStats } from "@fundxi/core/domain/match/team_match_stats";
import { BuyTeamButton } from "@/ui/components/BuyTeamButton";
import { TeamLink } from "@/ui/components/TeamLink";
import { TickValue } from "@/ui/components/TickValue";
import { useFixtureLiveVersion, useLiveRefetch, usePricesLiveVersion } from "@/ui/hooks/use_live_updates";
import { useViewport } from "@/ui/hooks/use_viewport";
import { PitchView, TeamChip } from "@/ui/pages/match/PitchView";
import { TeamRoster } from "@/ui/pages/match/TeamRoster";
import { count_match_events, MatchEventBadge, SubBadge, type MatchEventCounts } from "@/ui/pages/match/event_badge";
import { apply_subs, compute_subs, type SubInfo } from "@fundxi/core/domain/match/substitutions";

type LineupView = "list" | "pitch";

interface MatchViewProps {
  match: Match;
  on_back: () => void;
  on_open_player_profile: (player_id: number) => void;
  on_open_team?: (team_id: string) => void;
  go_portfolio?: () => void; // not used here; kept for the App's prop contract
  /** Watched player ids — to mark the watchlist star on roster cards. */
  watchlist?: Set<number>;
}

const GREEN = "var(--color-positive)";

// Single centered reading column (brief: one column, ~max 820, whitespace on the
// sides on desktop is the price of web/mobile parity).
const COLUMN_MAX = 760;

const POSITION_GROUPS: readonly { key: Position; label: string }[] = [
  { key: "GK", label: "Goalkeeper" },
  { key: "DF", label: "Defenders" },
  { key: "MF", label: "Midfielders" },
  { key: "FW", label: "Forwards" },
];
const POSITION_FALLBACK_LABEL: Record<Position, string> = {
  GK: "Goalkeeper",
  DF: "Defender",
  MF: "Midfielder",
  FW: "Forward",
};
const GOAL_GLYPHS = new Set(["⚽", "🎯"]);

function only_match_players(xs: (number | MatchPlayer)[]): MatchPlayer[] {
  return xs.filter((x): x is MatchPlayer => typeof x !== "number");
}

// Surname only (last whitespace token) — saves width so the minute always fits
// on the same line as the name (matches the native Scorers).
function _surname(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : full;
}

function ScorerColumn({ goals }: { goals: MatchEvent[] }) {
  // Empty cell (not null) so the two-column scorer grid stays aligned even when
  // only one side scored.
  if (goals.length === 0) return <div />;
  // Group goals by scorer so a player's minutes sit on the SAME line as the
  // name ("Surname 12', 45'"), collapsing a brace into one line. The minute is
  // its own non-shrinking element, so it is never pushed to a second line —
  // only the surname could ellipsis as a last resort. Mirrors native.
  const by_player: { name: string; mins: string[]; own: boolean }[] = [];
  for (const g of goals) {
    const name = g.player_name ?? "?";
    const own = g.is_own_goal === true;
    const min = `${g.minute}'${g.type === "🎯" ? " (p)" : ""}`;
    const row = by_player.find(p => p.name === name && p.own === own);
    if (row) row.mins.push(min);
    else by_player.push({ name, mins: [min], own });
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "#fff", fontWeight: 600, textAlign: "left", minWidth: 0 }}>
      {by_player.map((p, i) => (
        <div
          key={`${p.name}-${i}`}
          style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0, justifyContent: "flex-start" }}
        >
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            ⚽ {_surname(p.name)}
            {p.own ? <span style={{ opacity: 0.7, fontWeight: 700 }}> (og)</span> : null}
          </span>
          <span className="mono" style={{ flexShrink: 0, color: "rgba(255,255,255,.55)", fontWeight: 700 }}>{p.mins.join(", ")}</span>
        </div>
      ))}
    </div>
  );
}

export function MatchView({ match: initial_match, on_back, on_open_player_profile, on_open_team, watchlist }: MatchViewProps) {
  // The match comes in as a prop, but its clock / score / lineups / prices
  // change while an in-play (or replayed) match runs. We hold a live copy
  // refreshed from the SSE stream and fall back to the prop until it lands.
  const [live_match, set_live_match] = useState<Match | null>(null);
  const match = live_match ?? initial_match;
  useEffect(() => {
    set_live_match(null);
  }, [initial_match.fixture_id]);

  const home_team = teams_api.get(match.home_team_id);
  const away_team = teams_api.get(match.away_team_id);
  const is_live = match.status === "live";

  // Toggle between the roster list and the tactical pitch view. Always opens on
  // the list (the default) — the choice is per-view, not persisted.
  const [view_mode, set_view_mode] = useState<LineupView>("list");
  // One team at a time in the roster (home/away) — full-width rich cards beat the
  // old cramped two-column list (truncated names, no room for the trade signal).
  const [roster_team, set_roster_team] = useState<"home" | "away">("home");
  // Single-column layout (desktop = mobile, per the brief): the lineup, match
  // stats and commentary live in top-level tabs instead of a desktop side rail.
  const [top_tab, set_top_tab] = useState<"compos" | "stats" | "events">("compos");

  const goals = useMemo(
    () =>
      match.events
        .filter(e => GOAL_GLYPHS.has(e.type))
        .slice()
        .sort((a, b) => a.minute - b.minute),
    [match.events],
  );

  // Per-player event counts (goals + cards). Built once via the shared
  // helper and passed to both the pitch tokens (PitchView) and the
  // list cards (TeamRoster) so the two surfaces show the exact same
  // icons for the same player — coherence by construction.
  const event_counts = useMemo(() => count_match_events(match.events), [match.events]);

  // Substitution state: the backend ships the STARTING XI; we walk
  // the SUBSTITUTION events to know who actually entered / exited and
  // reshape the on-field XI accordingly (entering player inherits the
  // formation slot of the exiting one). Same helper for pitch & list.
  const subs = useMemo(() => compute_subs(match.events), [match.events]);
  const home_effective = useMemo(
    () => apply_subs(only_match_players(match.home_xi), match.home_bench ?? [], subs),
    [match.home_xi, match.home_bench, subs],
  );
  const away_effective = useMemo(
    () => apply_subs(only_match_players(match.away_xi), match.away_bench ?? [], subs),
    [match.away_xi, match.away_bench, subs],
  );

  // Commentary feed.
  const fixture_live_version = useFixtureLiveVersion(match.fixture_id);
  const [commentaries, set_commentaries] = useState<MatchComment[] | null>(null);
  const [team_stats, set_team_stats] = useState<TeamMatchStats | null>(null);
  useEffect(() => {
    if (!match.fixture_id) {
      set_commentaries([]);
      set_team_stats({});
      return;
    }
    let cancelled = false;
    set_commentaries(null);
    set_team_stats(null);
    comments_api
      .for_fixture(match.fixture_id)
      .then(items => {
        if (!cancelled) set_commentaries(items);
      })
      .catch(() => {
        if (!cancelled) set_commentaries([]);
      });
    team_stats_api
      .for_fixture(match.fixture_id)
      .then(stats => {
        if (!cancelled) set_team_stats(stats);
      })
      .catch(() => {
        if (!cancelled) set_team_stats({});
      });
    return () => {
      cancelled = true;
    };
  }, [match.fixture_id]);

  // Live: a fixture event/comment ping → re-fetch the match (clock /
  // score / scorers / per-player prices), the commentary feed AND the
  // team stats. Leading-edge throttle (750ms) so a burst of events
  // doesn't spawn dozens of parallel requests — at extreme replay
  // speeds (Streamlit speed=92 ≈ 0.65s per simulated minute) the
  // unthrottled version saturated the browser's fetch queue and the
  // streaming worker's SSE subscriber queue (100 msg), producing
  // visible freeze-then-jump catch-ups. 750ms ≈ up to 1.5 frames/s
  // on the slowest reasonable network — still smooth, never
  // overwhelms.
  const last_fixture_refresh = useRef(0);
  useLiveRefetch(fixture_live_version, () => {
    if (!match.fixture_id) return;
    const now = Date.now();
    if (now - last_fixture_refresh.current < 750) return;
    last_fixture_refresh.current = now;
    matches_api
      .refresh_match_by_fixture_id(match.fixture_id)
      .then(m => {
        if (m) set_live_match(m);
      })
      .catch(() => {
        /* keep the current match on a transient error */
      });
    comments_api
      .refresh_for_fixture(match.fixture_id)
      .then(set_commentaries)
      .catch(() => {
        /* keep the current feed on a transient error */
      });
    team_stats_api
      .refresh_for_fixture(match.fixture_id)
      .then(set_team_stats)
      .catch(() => {
        /* keep the current stats on a transient error */
      });
  });

  // Live: a price tick anywhere → refresh the universe valuations so the
  // roster's "total change" column stays current (synchronous re-render via
  // bump). ALSO refresh the match payload so the PITCH tile's baked-in
  // per-player ``value`` / ``change_last_match`` reflect the new prices —
  // throttled to 3s because prices tick ~5/s during a live match and
  // refresh_match returns a full payload; no need to hammer it.
  const prices_live_version = usePricesLiveVersion();
  const [, bump_valuations] = useState(0);
  const last_pitch_refresh = useRef(0);
  useLiveRefetch(prices_live_version, () => {
    void valuations_api.refresh().then(() => bump_valuations(v => v + 1));
    const now = Date.now();
    if (now - last_pitch_refresh.current < 3000) return;
    last_pitch_refresh.current = now;
    if (!match.fixture_id) return;
    matches_api
      .refresh_match_by_fixture_id(match.fixture_id)
      .then(m => {
        if (m) set_live_match(m);
      })
      .catch(() => {
        /* keep the current match on a transient error */
      });
  });

  const commentaries_chrono = useMemo(
    () => (commentaries ? [...commentaries].reverse() : []),
    [commentaries],
  );

  const card: CSSProperties = {
    background: "rgba(255,255,255,.02)",
    border: "1px solid rgba(255,255,255,.05)",
    borderRadius: 14,
    overflow: "hidden",
  };

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        animation: "fu .25s ease",
      }}
    >
      <div style={{ width: "100%", maxWidth: COLUMN_MAX, alignSelf: "center" }}>
        <button
          onClick={on_back}
          style={{
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.06)",
            borderRadius: 8,
            padding: "8px 14px",
            color: "rgba(255,255,255,.55)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← Back
        </button>
      </div>

      {/* Score header */}
      <div style={{ ...card, padding: "18px 20px", width: "100%", maxWidth: COLUMN_MAX, alignSelf: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Top-left: a small pulsing green dot + minute as the live marker
              (the big "LIVE" pill is redundant with the global LiveBar). */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {is_live && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-positive)", boxShadow: "0 0 6px var(--color-positive)", animation: "pulse 1.5s infinite" }} />
                {match.minute ? (
                  <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: "var(--color-positive)" }}>{match.minute}'</span>
                ) : null}
              </span>
            )}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 600 }}>
              Group {match.group}
            </span>
          </div>
          {!is_live && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", fontWeight: 600 }}>Full time</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 24, marginTop: 14 }}>
          <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
            <TeamLink team_id={match.home_team_id} on_open_team={on_open_team} style={{ display: "block" }}>
              <div style={{ fontSize: 48, lineHeight: 1 }}>{home_team?.flag}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, letterSpacing: -0.2, overflowWrap: "break-word" }}>
                {home_team?.name ?? match.home_team_id}
              </div>
            </TeamLink>
          </div>
          <div className="mono" style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1.5, paddingTop: 8, flexShrink: 0 }}>
            {match.home_score} : {match.away_score}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <TeamLink team_id={match.away_team_id} on_open_team={on_open_team} style={{ display: "block" }}>
              <div style={{ fontSize: 48, lineHeight: 1 }}>{away_team?.flag}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, letterSpacing: -0.2, overflowWrap: "break-word" }}>
                {away_team?.name ?? match.away_team_id}
              </div>
            </TeamLink>
          </div>
        </div>
        {/* Scorers under each team's half, left-anchored — same split as the
            Home live card so it's clear who scored for whom. */}
        {goals.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
            <ScorerColumn goals={goals.filter(g => g.team_id === match.home_team_id)} />
            <ScorerColumn goals={goals.filter(g => g.team_id === match.away_team_id)} />
          </div>
        )}
      </div>

      {/* Single centered column (desktop = mobile, per the brief): a
          Compos / Stats / Events tab bar, then the selected tab. Replaces the
          old desktop two-column side rail. */}
      <div style={{ width: "100%", maxWidth: COLUMN_MAX, alignSelf: "center", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <MatchTabBar tab={top_tab} on_change={set_top_tab} />

        {top_tab === "compos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {/* Team selector — drives the roster (and the Pitch when live). */}
            <div style={{ display: "flex", gap: 8 }}>
              {(["home", "away"] as const).map(t => {
                const tm = t === "home" ? home_team : away_team;
                const id = t === "home" ? match.home_team_id : match.away_team_id;
                const kit = t === "home" ? match.home_kit_color : match.away_kit_color;
                return (
                  <TeamChip
                    key={t}
                    name={tm?.name ?? id}
                    flag={tm?.flag}
                    flag_url={tm?.flag_url}
                    color={kit ?? tm?.color ?? "rgba(255,255,255,.5)"}
                    active={roster_team === t}
                    onClick={() => set_roster_team(t)}
                  />
                );
              })}
            </div>

            {/* Squad summary + "Buy team" — count, avg age, total value (all real
                data), with the basket trigger, like the team page header. */}
            {(roster_team === "home" ? home_team : away_team) && (
              <SquadSummaryCard
                team={(roster_team === "home" ? home_team : away_team)!}
                squad={(roster_team === "home" ? match.home_squad : match.away_squad) ?? []}
                on_open_player={on_open_player_profile}
              />
            )}

            {match.lineup_published === false ? (
              // Pre-lineup: full squad (who COULD play) with a "not confirmed"
              // banner — no XI/Bench split, no pitch (no formation yet).
              <>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "rgba(255,255,255,.6)",
                    background: "rgba(255,255,255,.03)",
                    border: "1px solid rgba(255,255,255,.06)",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  Lineup not announced yet — full squad shown, not confirmed to play.
                </div>
                <TeamRoster
                  xi={(roster_team === "home" ? match.home_squad : match.away_squad) ?? []}
                  bench={[]}
                  team_color={
                    roster_team === "home"
                      ? (match.home_kit_color ?? home_team?.color)
                      : (match.away_kit_color ?? away_team?.color)
                  }
                  event_counts={event_counts}
                  subs={subs}
                  squad_mode
                  started={is_live || match.status === "finished"}
                  watchlist={watchlist}
                  on_open_player={on_open_player_profile}
                />
              </>
            ) : (
              <>
                {/* View toggle — List / Pitch, applied to the selected team. */}
                <div
                  role="tablist"
                  style={{
                    display: "inline-flex",
                    alignSelf: "flex-start",
                    background: "rgba(255,255,255,.03)",
                    border: "1px solid rgba(255,255,255,.06)",
                    borderRadius: 8,
                    padding: 3,
                    gap: 2,
                  }}
                >
                  {(["list", "pitch"] as const).map(m => {
                    const active = view_mode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => set_view_mode(m)}
                        style={{
                          padding: "5px 14px",
                          border: "none",
                          background: active ? "rgba(255,255,255,.08)" : "transparent",
                          color: active ? "#fff" : "rgba(255,255,255,.5)",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          borderRadius: 6,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {m === "list" ? "List" : "Pitch"}
                      </button>
                    );
                  })}
                </div>

                {view_mode === "list" ? (
                  <TeamRoster
                    xi={(roster_team === "home" ? home_effective : away_effective).on_field}
                    bench={(roster_team === "home" ? home_effective : away_effective).bench}
                    team_color={
                      roster_team === "home"
                        ? (match.home_kit_color ?? home_team?.color)
                        : (match.away_kit_color ?? away_team?.color)
                    }
                    event_counts={event_counts}
                    subs={subs}
                    started={is_live || match.status === "finished"}
                    watchlist={watchlist}
                    on_open_player={on_open_player_profile}
                  />
                ) : (
                  <div>
                    <PitchView
                      match={match}
                      subs={subs}
                      team={roster_team}
                      home_color={match.home_kit_color ?? home_team?.color}
                      away_color={match.away_kit_color ?? away_team?.color}
                      on_open_player={on_open_player_profile}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {top_tab === "stats" && (
          <TeamStatsPanel
            stats={team_stats}
            home_team_id={match.home_team_id}
            away_team_id={match.away_team_id}
            home_color={match.home_kit_color ?? home_team?.color}
            away_color={match.away_kit_color ?? away_team?.color}
            card={card}
          />
        )}

        {top_tab === "events" && (
          <div style={{ ...card, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                padding: "12px 16px",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,.6)",
                borderBottom: "1px solid rgba(255,255,255,.05)",
                flexShrink: 0,
              }}
            >
              Commentary
            </div>
            <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 220px)" }}>
              <Commentary comments={commentaries_chrono} loading={commentaries === null} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Squad summary card — count · avg age · total value + the "Buy team" basket
 * trigger. All real data (squad list, per-player age + live valuation). Mirrors
 * the team-page header and the fixture_new design. */
function SquadSummaryCard({
  team,
  squad,
  on_open_player,
}: {
  team: Team;
  squad: MatchPlayer[];
  on_open_player: (player_id: number) => void;
}) {
  const count = squad.length;
  const ages = squad.map(p => players_api.get(p.id)?.age).filter((a): a is number => a != null);
  const avg_age = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null;
  const value = squad.reduce((s, p) => s + (valuations_api.get_for_player(p.id)?.current_price ?? p.value), 0);
  const value_label = value >= 1000 ? `€${(value / 1000).toFixed(2)}B` : `€${Math.round(value)}M`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "12px 14px",
        background: "rgba(255,255,255,.025)",
        border: "1px solid rgba(255,255,255,.06)",
        borderRadius: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: -0.2 }}>{team.name} squad</div>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", marginTop: 2 }}>
          {count} {count === 1 ? "player" : "players"}
          {avg_age != null ? ` · avg age ${avg_age.toFixed(1)}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>
            Squad value
          </div>
          <div className="mono" style={{ fontSize: 15, fontWeight: 800, marginTop: 1 }}>{value_label}</div>
        </div>
        <BuyTeamButton team={team} on_open_player={on_open_player} />
      </div>
    </div>
  );
}

/** Top-level match tabs — single column (desktop = mobile). */
function MatchTabBar({
  tab,
  on_change,
}: {
  tab: "compos" | "stats" | "events";
  on_change: (t: "compos" | "stats" | "events") => void;
}) {
  const tabs: { key: "compos" | "stats" | "events"; label: string }[] = [
    { key: "compos", label: "Compos" },
    { key: "stats", label: "Stats" },
    { key: "events", label: "Events" },
  ];
  return (
    <div role="tablist" style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: 4 }}>
      {tabs.map(t => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => on_change(t.key)}
            style={{
              flex: 1,
              padding: "9px 0",
              border: "none",
              background: active ? "rgba(255,255,255,.08)" : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,.5)",
              fontSize: 12.5,
              fontWeight: 800,
              letterSpacing: 0.4,
              borderRadius: 7,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}


// Subset of Sportmonks stat codes surfaced in the side panel. Presentational
// localization only — the data itself is the provider's. Order matters: it
// drives the row order in the panel.
const STAT_ROWS: { code: string; label: string; is_pct?: boolean }[] = [
  { code: "ball-possession", label: "Possession", is_pct: true },
  { code: "shots-total", label: "Shots" },
  { code: "shots-on-target", label: "On target" },
  { code: "corners", label: "Corners" },
  { code: "fouls", label: "Fouls" },
  { code: "offsides", label: "Offsides" },
  { code: "yellowcards", label: "Yellow cards" },
  { code: "redcards", label: "Red cards" },
  { code: "passes", label: "Passes" },
  { code: "successful-passes-percentage", label: "Pass accuracy", is_pct: true },
  { code: "dangerous-attacks", label: "Dangerous attacks" },
];

function TeamStatsPanel({
  stats,
  home_team_id,
  away_team_id,
  home_color,
  away_color,
  card,
}: {
  stats: TeamMatchStats | null;
  home_team_id: string;
  away_team_id: string;
  home_color?: string;
  away_color?: string;
  card: CSSProperties;
}) {
  const home = stats?.[home_team_id] ?? {};
  const away = stats?.[away_team_id] ?? {};
  const has_any = STAT_ROWS.some(r => r.code in home || r.code in away);
  return (
    <div style={card}>
      <div
        style={{
          padding: "12px 16px",
          fontSize: 12,
          fontWeight: 700,
          color: "rgba(255,255,255,.6)",
          borderBottom: "1px solid rgba(255,255,255,.05)",
        }}
      >
        Match stats
      </div>
      {stats === null ? (
        <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,.4)" }}>loading…</div>
      ) : !has_any ? (
        <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,.4)" }}>No stats yet.</div>
      ) : (
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {STAT_ROWS.map(row => {
            const h = home[row.code];
            const a = away[row.code];
            if (h == null && a == null) return null;
            return (
              <StatRow
                key={row.code}
                label={row.label}
                home={h}
                away={a}
                is_pct={row.is_pct}
                home_color={home_color}
                away_color={away_color}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  home,
  away,
  is_pct,
  home_color,
  away_color,
}: {
  label: string;
  home: number | undefined;
  away: number | undefined;
  is_pct?: boolean;
  home_color?: string;
  away_color?: string;
}) {
  const home_v = home ?? 0;
  const away_v = away ?? 0;
  const total = home_v + away_v;
  const home_share = total > 0 ? home_v / total : 0.5;
  const fmt = (v: number | undefined) => (v == null ? "—" : is_pct ? `${Math.round(v)}%` : String(Math.round(v)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "#fff", minWidth: 32 }}>
          {fmt(home)}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(255,255,255,.45)",
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          className="mono"
          style={{ fontSize: 12, fontWeight: 700, color: "#fff", minWidth: 32, textAlign: "right" }}
        >
          {fmt(away)}
        </span>
      </div>
      <div style={{ display: "flex", height: 3, borderRadius: 2, overflow: "hidden", background: "rgba(255,255,255,.05)" }}>
        <div
          style={{
            width: `${home_share * 100}%`,
            background: home_color ?? "rgba(255,255,255,.5)",
          }}
        />
        <div
          style={{
            width: `${(1 - home_share) * 100}%`,
            background: away_color ?? "rgba(255,255,255,.25)",
          }}
        />
      </div>
    </div>
  );
}

function Commentary({ comments, loading }: { comments: MatchComment[]; loading: boolean }) {
  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,.4)" }}>loading commentary…</div>;
  }
  if (comments.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,.4)" }}>No commentary for this match.</div>;
  }
  return (
    <div style={{ padding: 8 }}>
      {comments.map(c => {
        const minute_label = c.extra_minute ? `${c.minute}+${c.extra_minute}'` : `${c.minute}'`;
        const accent = c.is_goal ? GREEN : c.is_important ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.25)";
        return (
          <div
            key={c.id}
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              background: c.is_goal ? "color-mix(in srgb, var(--color-positive) 5%, transparent)" : "transparent",
              border: `1px solid ${c.is_goal ? "color-mix(in srgb, var(--color-positive) 10%, transparent)" : "rgba(255,255,255,.03)"}`,
              borderLeft: `3px solid ${accent}`,
              marginBottom: 4,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 36, gap: 1 }}>
              <span className="mono" style={{ fontSize: 11, color: accent, fontWeight: 800 }}>{minute_label}</span>
              {c.is_goal && <span style={{ fontSize: 14 }}>⚽</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: c.is_goal ? 700 : 500, color: c.is_goal ? "#fff" : "rgba(255,255,255,.85)", lineHeight: 1.45 }}>
                {c.comment}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

