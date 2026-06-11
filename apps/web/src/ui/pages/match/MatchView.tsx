import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { Match, MatchEvent, MatchPlayer } from "@fundxi/core/domain/match/match";
import type { MatchComment } from "@fundxi/core/domain/match/match_comment";
import type { Position } from "@fundxi/core/domain/player/player";
import { comments_api } from "@fundxi/core/api/comments_api";
import { fmt_signed_pct } from "@/ui/helpers/format";
import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { team_stats_api } from "@fundxi/core/api/team_stats_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import type { TeamMatchStats } from "@fundxi/core/domain/match/team_match_stats";
import { PlayerAvatar } from "@/ui/components/PlayerAvatar";
import { TeamLink } from "@/ui/components/TeamLink";
import { TickValue } from "@/ui/components/TickValue";
import { useFixtureLiveVersion, useLiveRefetch, usePricesLiveVersion } from "@/ui/hooks/use_live_updates";
import { PitchView } from "@/ui/pages/match/PitchView";
import { count_match_events, MatchEventBadge, SubBadge, type MatchEventCounts } from "@/ui/pages/match/event_badge";
import { apply_subs, compute_subs, type SubInfo } from "@fundxi/core/domain/match/substitutions";

const LINEUP_VIEW_STORAGE_KEY = "fundxi.lineup_view";
type LineupView = "list" | "pitch";

interface MatchViewProps {
  match: Match;
  on_back: () => void;
  on_open_player_profile: (player_id: number) => void;
  on_open_team?: (team_id: string) => void;
  go_portfolio?: () => void; // not used here; kept for the App's prop contract
}

const GREEN = "var(--color-positive)";
const RED = "var(--color-negative)";

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

function fmt_pct(v: number | undefined | null): string {
  if (v == null) return "—";
  return `${fmt_signed_pct(v, 1)}`;
}
function pct_color(v: number | undefined | null): string {
  if (v == null) return "rgba(255,255,255,.35)";
  return v >= 0 ? GREEN : RED;
}
function only_match_players(xs: (number | MatchPlayer)[]): MatchPlayer[] {
  return xs.filter((x): x is MatchPlayer => typeof x !== "number");
}

function ScorerColumn({ goals, align }: { goals: MatchEvent[]; align: "left" | "right" }) {
  if (goals.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontSize: 11,
        textAlign: align,
        color: "#fff",
        fontWeight: 600,
      }}
    >
      {goals.map((g, i) => (
        <div key={`${g.minute}-${g.player_name ?? "?"}-${i}`}>
          ⚽ {g.player_name ?? "?"}
          {g.type === "🎯" ? " (p)" : ""}{" "}
          <span className="mono" style={{ color: "rgba(255,255,255,.55)", fontWeight: 700 }}>{g.minute}'</span>
        </div>
      ))}
    </div>
  );
}

export function MatchView({ match: initial_match, on_back, on_open_player_profile, on_open_team }: MatchViewProps) {
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

  // Toggle between the roster list and the tactical pitch view. Persisted in
  // localStorage so the user's choice survives reloads.
  const [view_mode, set_view_mode] = useState<LineupView>(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem(LINEUP_VIEW_STORAGE_KEY) === "pitch" ? "pitch" : "list";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LINEUP_VIEW_STORAGE_KEY, view_mode);
  }, [view_mode]);

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
  // list cards (DualRoster→RosterCard) so the two surfaces show the
  // exact same icons for the same player — coherence by construction.
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

  const is_desktop = useIsDesktop();

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
      <div>
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
      <div style={{ ...card, padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 600 }}>
            Group {match.group}
          </span>
          {is_live ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.6)", background: "rgba(255,255,255,.08)", padding: "4px 10px", borderRadius: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.6)", display: "inline-block", marginRight: 6, animation: "pulse 1.5s infinite" }} />
              {match.minute}'
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", fontWeight: 600 }}>Full time</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 24, marginTop: 14 }}>
          <div style={{ flex: 1, textAlign: "right" }}>
            <TeamLink team_id={match.home_team_id} on_open_team={on_open_team} style={{ display: "block" }}>
              <div style={{ fontSize: 48, lineHeight: 1 }}>{home_team?.flag}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, letterSpacing: -0.2 }}>{home_team?.name ?? match.home_team_id}</div>
            </TeamLink>
            <ScorerColumn goals={goals.filter(g => g.team_id === match.home_team_id)} align="right" />
          </div>
          <div className="mono" style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1.5, paddingTop: 8, flexShrink: 0 }}>
            {match.home_score} : {match.away_score}
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <TeamLink team_id={match.away_team_id} on_open_team={on_open_team} style={{ display: "block" }}>
              <div style={{ fontSize: 48, lineHeight: 1 }}>{away_team?.flag}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, letterSpacing: -0.2 }}>{away_team?.name ?? match.away_team_id}</div>
            </TeamLink>
            <ScorerColumn goals={goals.filter(g => g.team_id === match.away_team_id)} align="left" />
          </div>
        </div>
      </div>

      {/* Live commentary ticker — keeps the most recent events in view above
          the fold. Scrolls right-to-left continuously, pauses on hover. */}
      <LiveTicker comments={commentaries ?? []} card_style={card} />

      {/* Two-column grid on desktop: lineup on the left, sticky Stats +
          Commentary panel on the right. On mobile / narrow viewports the
          same widgets stack vertically — same content, just laid out by
          available width. */}
      <div
        style={
          is_desktop
            ? {
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 340px",
                gap: 16,
                alignItems: "start",
              }
            : { display: "flex", flexDirection: "column", gap: 16 }
        }
      >
        {/* Left column: lineup view toggle + rosters / pitch */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              role="tablist"
              style={{
                display: "inline-flex",
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
                      padding: "5px 12px",
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
          </div>

          {view_mode === "list" ? (
            <DualRoster
              home_xi={home_effective.on_field}
              away_xi={away_effective.on_field}
              home_bench={home_effective.bench}
              away_bench={away_effective.bench}
              home_title={`${home_team?.flag ?? ""} ${home_team?.name ?? match.home_team_id}`.trim()}
              away_title={`${away_team?.flag ?? ""} ${away_team?.name ?? match.away_team_id}`.trim()}
              home_team_id={match.home_team_id}
              away_team_id={match.away_team_id}
              home_color={match.home_kit_color ?? home_team?.color}
              away_color={match.away_kit_color ?? away_team?.color}
              event_counts={event_counts}
              subs={subs}
              card={card}
              on_open_player={on_open_player_profile}
              on_open_team={on_open_team}
            />
          ) : (
            <div>
              <PitchView
                match={match}
                subs={subs}
                home_color={match.home_kit_color ?? home_team?.color}
                away_color={match.away_kit_color ?? away_team?.color}
                on_open_player={on_open_player_profile}
              />
            </div>
          )}
        </div>

        {/* Right column: Stats + Commentary, both bounded so they never
            push the page height beyond the viewport. Sticky on desktop. */}
        <aside
          style={
            is_desktop
              ? {
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  position: "sticky",
                  top: 16,
                  alignSelf: "start",
                  maxHeight: "calc(100vh - 32px)",
                  overflowY: "auto",
                }
              : { display: "flex", flexDirection: "column", gap: 14 }
          }
        >
          <TeamStatsPanel
            stats={team_stats}
            home_team_id={match.home_team_id}
            away_team_id={match.away_team_id}
            home_color={match.home_kit_color ?? home_team?.color}
            away_color={match.away_kit_color ?? away_team?.color}
            card={card}
          />
          {/* Commentary: FIXED height, independent of content and of the
              stats panel. The pane never resizes as live comments arrive
              — only its inner list scrolls. */}
          <div
            style={{
              ...card,
              display: "flex",
              flexDirection: "column",
              flex: "none",
            }}
          >
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
            <div
              style={{
                overflowY: "auto",
                height: is_desktop ? 460 : 360,
                flexShrink: 0,
              }}
            >
              <Commentary comments={commentaries_chrono} loading={commentaries === null} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function useIsDesktop(): boolean {
  const [is_desktop, set_is_desktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => set_is_desktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return is_desktop;
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

function _group_by_position(xi: MatchPlayer[]): Record<Position, MatchPlayer[]> {
  const grouped: Record<Position, MatchPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of xi) grouped[p.position].push(p);
  for (const k of Object.keys(grouped) as Position[]) {
    grouped[k].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99));
  }
  return grouped;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "14px 0 10px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 10,
        fontWeight: 700,
        color: "rgba(255,255,255,.5)",
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}
    >
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.07)" }} />
      <span>{label}</span>
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.07)" }} />
    </div>
  );
}

function DualRoster({
  home_xi,
  away_xi,
  home_bench,
  away_bench,
  home_title,
  away_title,
  home_team_id,
  away_team_id,
  home_color,
  away_color,
  event_counts,
  subs,
  card,
  on_open_player,
  on_open_team,
}: {
  home_xi: MatchPlayer[];
  away_xi: MatchPlayer[];
  home_bench: MatchPlayer[];
  away_bench: MatchPlayer[];
  home_title: string;
  away_title: string;
  home_team_id: string;
  away_team_id: string;
  home_color?: string;
  away_color?: string;
  event_counts: Map<number, MatchEventCounts>;
  subs: Map<number, SubInfo>;
  card: CSSProperties;
  on_open_player: (player_id: number) => void;
  on_open_team?: (team_id: string) => void;
}) {
  const home_by_pos = useMemo(() => _group_by_position(home_xi), [home_xi]);
  const away_by_pos = useMemo(() => _group_by_position(away_xi), [away_xi]);
  const home_subs = useMemo(
    () => [...home_bench].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99)),
    [home_bench],
  );
  const away_subs = useMemo(
    () => [...away_bench].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99)),
    [away_bench],
  );

  const grid_2col: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    alignItems: "start",
  };
  const col_stack: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

  return (
    <div style={card}>
      {/* Team header bars, one per column, aligned. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 14px",
            fontSize: 13,
            fontWeight: 800,
            overflow: "hidden",
          }}
        >
          {home_color ? <TeamDot color={home_color} /> : null}
          <TeamLink
            team_id={home_team_id}
            on_open_team={on_open_team}
            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {home_title}
          </TeamLink>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 14px",
            fontSize: 13,
            fontWeight: 800,
            overflow: "hidden",
          }}
        >
          {away_color ? <TeamDot color={away_color} /> : null}
          <TeamLink
            team_id={away_team_id}
            on_open_team={on_open_team}
            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {away_title}
          </TeamLink>
        </div>
      </div>

      {/* Column glow — team identity carried by a soft edge halo per column
          (home on the left, away on the right), replacing the per-card left
          bar that pulled every row's weight to the left. */}
      <div style={{ position: "relative", padding: "0 12px 12px" }}>
        {home_color ? <ColumnGlow color={home_color} side="left" /> : null}
        {away_color ? <ColumnGlow color={away_color} side="right" /> : null}
        {POSITION_GROUPS.map(g => {
          const home_ps = home_by_pos[g.key];
          const away_ps = away_by_pos[g.key];
          if (home_ps.length === 0 && away_ps.length === 0) return null;
          return (
            <div key={g.key}>
              <SectionDivider label={g.label} />
              <div style={grid_2col}>
                <div style={col_stack}>
                  {home_ps.map(p => (
                    <RosterCard key={p.id} p={p} on_open={on_open_player} team_color={home_color} events={event_counts.get(p.id)} sub_info={subs.get(p.id)} />
                  ))}
                </div>
                <div style={col_stack}>
                  {away_ps.map(p => (
                    <RosterCard key={p.id} p={p} on_open={on_open_player} team_color={away_color} events={event_counts.get(p.id)} sub_info={subs.get(p.id)} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {(home_subs.length > 0 || away_subs.length > 0) && (
          <>
            <SectionDivider label="Substitutes" />
            <div style={grid_2col}>
              <div style={col_stack}>
                {home_subs.map(p => (
                  <RosterCard key={p.id} p={p} on_open={on_open_player} team_color={home_color} events={event_counts.get(p.id)} sub_info={subs.get(p.id)} sub />
                ))}
              </div>
              <div style={col_stack}>
                {away_subs.map(p => (
                  <RosterCard key={p.id} p={p} on_open={on_open_player} team_color={away_color} events={event_counts.get(p.id)} sub_info={subs.get(p.id)} sub />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RosterCard({
  p,
  on_open,
  team_color,
  events,
  sub_info,
  sub,
}: {
  p: MatchPlayer;
  on_open: (player_id: number) => void;
  team_color?: string;
  events?: MatchEventCounts;
  sub_info?: SubInfo;
  /** ``true`` when this card is in the bench section (visual dim).
   * Distinct from ``sub_info`` which marks any swapped player. */
  sub?: boolean;
}) {
  const ref_player = players_api.get(p.id);
  const valuation = valuations_api.get_for_player(p.id);
  // Live price = the universe valuation (refreshed on the prices SSE
  // topic), same source as Screener/Home so it can't disagree.
  const live_price = valuation?.current_price ?? p.value;
  const total_change = valuation?.change_since_inception ?? 0;
  const match_change = p.change_last_match ?? 0;
  const exact_position = ref_player?.detailed_position ?? POSITION_FALLBACK_LABEL[p.position];
  const photo = ref_player?.image_path;
  return (
    <div
      onClick={() => on_open(p.id)}
      title="Open player"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        // Same card shape for starters and subs; subs are simply dimmed —
        // subtle but clearly secondary to the eye.
        background: sub ? "rgba(255,255,255,.012)" : "rgba(255,255,255,.035)",
        border: sub ? "1px solid rgba(255,255,255,.035)" : "1px solid rgba(255,255,255,.05)",
        borderRadius: 10,
        cursor: "pointer",
        transition: "background .15s ease, border-color .15s ease",
        opacity: sub ? 0.62 : 1,
      }}
    >
      {/* Avatar with jersey badge overlay. The photo/fallback decision is owned
          by PlayerAvatar (silhouette when missing/broken); the number stays a
          separate corner badge below. */}
      <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
        <PlayerAvatar image_path={photo} size={40} radius={20} fit="cover" alt="" />
        <span
          className="mono"
          style={{
            position: "absolute",
            bottom: -3,
            right: -4,
            fontSize: 9,
            fontWeight: 800,
            background: "#0b0f14",
            color: "rgba(255,255,255,.85)",
            borderRadius: 8,
            padding: "1px 5px",
            lineHeight: 1.2,
            border: "1px solid rgba(255,255,255,.12)",
          }}
        >
          {p.jersey_number}
        </span>
      </div>

      {/* Name + position. Badges sit IMMEDIATELY to the right of the
          name (sibling flex item, flexShrink: 0 so they never get
          clipped by the name ellipsis). No other element is moved. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.25 }}>
          <span
            style={{
              flex: "0 1 auto",
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {p.name}
          </span>
          <span style={{ flexShrink: 0, display: "inline-flex", gap: 4 }}>
            <MatchEventBadge events={events} variant="inline" />
            <SubBadge sub={sub_info} variant="inline" />
          </span>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3, marginTop: 2 }}>
          {exact_position}
        </div>
      </div>

      {/* Stats: price + two labelled deltas, all right-aligned */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span className="mono" style={{ fontSize: 14, fontWeight: 800, lineHeight: 1, color: "#fff" }}>
          <TickValue value={live_price}>€{live_price}M</TickValue>
        </span>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <Stat label="match" value={match_change} hint="Variation depuis le coup d'envoi de ce match" />
          <Stat label="total" value={total_change} hint="Variation cumulée depuis le début du tournoi" dim />
        </div>
      </div>

      {/* Mini marqueur — discrete team-color dot, right-aligned and symmetric
          across both columns. Confirms team membership without weighting the card. */}
      {team_color ? <TeamDot color={team_color} style={{ marginLeft: 2 }} /> : null}
    </div>
  );
}

// Small team-color dot — the shared "mini marqueur" used in the column headers
// and on each roster card, replacing the heavy per-card left bar.
function TeamDot({ color, size = 7, style }: { color: string; size?: number; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{ flexShrink: 0, width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", ...style }}
    />
  );
}

// Soft vertical glow hugging a column's outer edge — a thin colored bar blurred
// into a halo, faking a gradient falloff without an extra dependency.
function ColumnGlow({ color, side }: { color: string; side: "left" | "right" }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 8,
        bottom: 8,
        ...(side === "left" ? { left: 0 } : { right: 0 }),
        width: 3,
        background: color,
        opacity: 0.5,
        borderRadius: 2,
        filter: "blur(3px)",
        pointerEvents: "none",
      }}
    />
  );
}

function Stat({ label, value, hint, dim }: { label: string; value: number; hint: string; dim?: boolean }) {
  return (
    <div title={hint} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.1, opacity: dim ? 0.82 : 1 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: pct_color(value), marginTop: 1 }}>
        {fmt_pct(value)}
      </span>
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

// Horizontal scrolling ticker — sits above the line-up so the latest live
// commentary stays visible without scrolling the page. The track holds two
// back-to-back copies of the same comment list and animates by -50% so the
// loop is seamless; pause-on-hover gives the user time to read.
//
// Speed scales with content width so a long list doesn't blast past and a
// short list doesn't crawl — ~70 px/s feels right for live updates.
function LiveTicker({ comments, card_style }: { comments: MatchComment[]; card_style: CSSProperties }) {
  // Newest first — the user expects the freshest event to appear first as
  // it slides in from the right.
  const items = useMemo(() => comments.slice(0, 30), [comments]);
  const [paused, set_paused] = useState(false);
  const [track_w, set_track_w] = useState(0);
  const track_ref = useRef<HTMLDivElement>(null);

  // Measure one copy's width (the track holds two copies). Re-measure on
  // resize so the animation speed stays consistent across viewport sizes.
  useEffect(() => {
    if (!track_ref.current) return;
    const measure = () => {
      const el = track_ref.current;
      if (!el) return;
      // scrollWidth is the full width of both copies; we want one copy.
      set_track_w(el.scrollWidth / 2);
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(track_ref.current);
    return () => obs.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const duration_s = Math.max(20, Math.round(track_w / 70));

  const render_one = (c: MatchComment, key_prefix: string) => {
    const minute_label = c.extra_minute ? `${c.minute}+${c.extra_minute}'` : `${c.minute}'`;
    const accent = c.is_goal ? GREEN : c.is_important ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.3)";
    return (
      <span
        key={`${key_prefix}-${c.id}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "0 18px",
          borderRight: "1px solid rgba(255,255,255,.05)",
          flexShrink: 0,
        }}
      >
        <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: accent }}>
          {minute_label}
        </span>
        {c.is_goal ? <span style={{ fontSize: 13 }}>⚽</span> : null}
        <span
          style={{
            fontSize: 12,
            fontWeight: c.is_goal ? 700 : 500,
            color: c.is_goal ? "#fff" : "rgba(255,255,255,.8)",
            whiteSpace: "nowrap",
          }}
        >
          {c.comment}
        </span>
      </span>
    );
  };

  return (
    <div
      onMouseEnter={() => set_paused(true)}
      onMouseLeave={() => set_paused(false)}
      style={{
        ...card_style,
        display: "flex",
        alignItems: "stretch",
        height: 38,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 12px",
          background: "color-mix(in srgb, var(--color-positive) 8%, transparent)",
          borderRight: "1px solid color-mix(in srgb, var(--color-positive) 18%, transparent)",
          flexShrink: 0,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.4,
          color: GREEN,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: GREEN,
            display: "inline-block",
            animation: "pulse 1.5s infinite",
          }}
        />
        LIVE
      </div>
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          // Soft fade at the right edge so the upcoming item appears to drift
          // in rather than pop in mid-text. Same trick on the left edge for
          // the trailing item.
          maskImage:
            "linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)",
        }}
      >
        <div
          ref={track_ref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "100%",
            animation: `marquee ${duration_s}s linear infinite`,
            animationPlayState: paused ? "paused" : "running",
            willChange: "transform",
          }}
        >
          {items.map(c => render_one(c, "a"))}
          {/* Second copy — the seamless loop relies on the track being
              exactly 2x one copy's width and the keyframe ending at -50%. */}
          {items.map(c => render_one(c, "b"))}
        </div>
      </div>
    </div>
  );
}
