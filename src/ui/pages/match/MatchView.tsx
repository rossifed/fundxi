import { type CSSProperties, useEffect, useMemo, useState } from "react";
import type { Match, MatchEvent, MatchPlayer } from "@/domain/match/match";
import type { MatchComment } from "@/domain/match/match_comment";
import type { Position } from "@/domain/player/player";
import { comments_api } from "@/api/comments_api";
import { matches_api } from "@/api/matches_api";
import { players_api } from "@/api/players_api";
import { teams_api } from "@/api/teams_api";
import { valuations_api } from "@/api/valuations_api";
import { useFixtureLiveVersion, useLiveRefetch, usePricesLiveVersion } from "@/ui/hooks/use_live_updates";

interface MatchViewProps {
  match: Match;
  on_back: () => void;
  on_open_player_profile: (player_id: number) => void;
  go_portfolio?: () => void; // not used here; kept for the App's prop contract
}

const GREEN = "#216c6e";
const RED = "#E41541";

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
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
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
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        fontSize: 12,
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

export function MatchView({ match: initial_match, on_back, on_open_player_profile }: MatchViewProps) {
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

  const goals = useMemo(
    () =>
      match.events
        .filter(e => GOAL_GLYPHS.has(e.type))
        .slice()
        .sort((a, b) => a.minute - b.minute),
    [match.events],
  );

  // Commentary feed.
  const fixture_live_version = useFixtureLiveVersion(match.fixture_id);
  const [commentaries, set_commentaries] = useState<MatchComment[] | null>(null);
  useEffect(() => {
    if (!match.fixture_id) {
      set_commentaries([]);
      return;
    }
    let cancelled = false;
    set_commentaries(null);
    comments_api
      .for_fixture(match.fixture_id)
      .then(items => {
        if (!cancelled) set_commentaries(items);
      })
      .catch(() => {
        if (!cancelled) set_commentaries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [match.fixture_id]);

  // Live: a fixture event/comment ping → re-fetch the match (clock / score /
  // scorers / per-player prices) and the commentary feed in place.
  useLiveRefetch(fixture_live_version, () => {
    if (!match.fixture_id) return;
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
  });

  // Live: a price tick anywhere → refresh the universe valuations so the
  // roster's "total change" column stays current. The setter call alone
  // re-renders (RosterRow then reads the fresh, synchronously-cached valuation).
  const prices_live_version = usePricesLiveVersion();
  const [, bump_valuations] = useState(0);
  useLiveRefetch(prices_live_version, () => {
    void valuations_api.refresh().then(() => bump_valuations(v => v + 1));
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
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, animation: "fu .25s ease" }}>
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
            <div style={{ fontSize: 36, lineHeight: 1 }}>{home_team?.flag}</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{home_team?.name ?? match.home_team_id}</div>
            <ScorerColumn goals={goals.filter(g => g.team_id === match.home_team_id)} align="right" />
          </div>
          <div className="mono" style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1.5, paddingTop: 4, flexShrink: 0 }}>
            {match.home_score} : {match.away_score}
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 36, lineHeight: 1 }}>{away_team?.flag}</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{away_team?.name ?? match.away_team_id}</div>
            <ScorerColumn goals={goals.filter(g => g.team_id === match.away_team_id)} align="left" />
          </div>
        </div>
      </div>

      {/* Rosters — the two line-ups, side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
        <TeamRoster
          title={`${home_team?.flag ?? ""} ${home_team?.name ?? match.home_team_id}`.trim()}
          team_color={home_team?.color}
          xi={only_match_players(match.home_xi)}
          bench={match.home_bench ?? []}
          card={card}
          on_open_player={on_open_player_profile}
        />
        <TeamRoster
          title={`${away_team?.flag ?? ""} ${away_team?.name ?? match.away_team_id}`.trim()}
          team_color={away_team?.color}
          xi={match.away_xi}
          bench={match.away_bench ?? []}
          card={card}
          on_open_player={on_open_player_profile}
        />
      </div>

      {/* Commentary */}
      <div style={card}>
        <div style={{ padding: "12px 16px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.6)", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          Commentary
        </div>
        <Commentary comments={commentaries_chrono} loading={commentaries === null} />
      </div>
    </div>
  );
}

function TeamRoster({
  title,
  team_color,
  xi,
  bench,
  card,
  on_open_player,
}: {
  title: string;
  team_color?: string;
  xi: MatchPlayer[];
  bench: MatchPlayer[];
  card: CSSProperties;
  on_open_player: (player_id: number) => void;
}) {
  const starters_by_pos = useMemo(() => {
    const grouped: Record<Position, MatchPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
    for (const p of xi) grouped[p.position].push(p);
    for (const k of Object.keys(grouped) as Position[]) {
      grouped[k].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99));
    }
    return grouped;
  }, [xi]);
  const subs = useMemo(
    () => [...bench].sort((a, b) => (a.jersey_number || 99) - (b.jersey_number || 99)),
    [bench],
  );

  const section_header = (label: string, opts?: { strong?: boolean }) => (
    <div
      style={{
        padding: "9px 14px 4px",
        fontSize: 10,
        fontWeight: 700,
        color: opts?.strong ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.32)",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        background: "rgba(255,255,255,.018)",
      }}
    >
      {label}
    </div>
  );

  return (
    <div style={card}>
      <div
        style={{
          padding: "11px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          borderBottom: "1px solid rgba(255,255,255,.05)",
          borderLeft: team_color ? `3px solid ${team_color}` : undefined,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,.3)", letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" }}>
          € · Δm · Δtot
        </span>
      </div>
      {POSITION_GROUPS.map(g => {
        const ps = starters_by_pos[g.key];
        if (ps.length === 0) return null;
        return (
          <div key={g.key}>
            {section_header(g.label)}
            {ps.map(p => (
              <RosterRow key={p.id} p={p} on_open={on_open_player} />
            ))}
          </div>
        );
      })}
      {subs.length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,.08)" }}>
          {section_header("Substitutes", { strong: true })}
          {subs.map(p => (
            <RosterRow key={p.id} p={p} on_open={on_open_player} sub />
          ))}
        </div>
      )}
    </div>
  );
}

function RosterRow({ p, on_open, sub }: { p: MatchPlayer; on_open: (player_id: number) => void; sub?: boolean }) {
  const ref_player = players_api.get(p.id);
  const valuation = valuations_api.get_for_player(p.id);
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
        gap: 10,
        padding: "9px 14px",
        borderTop: "1px solid rgba(255,255,255,.03)",
        cursor: "pointer",
        opacity: sub ? 0.82 : 1,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          background: "rgba(255,255,255,.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {photo ? (
          <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.5)" }}>
            {p.jersey_number}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
          {p.name}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
          #{p.jersey_number} · {exact_position}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        <span className="mono" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>€{p.value}M</span>
        <span style={{ display: "flex", gap: 7, fontSize: 11, fontWeight: 700, lineHeight: 1.3 }}>
          <span className="mono" style={{ color: pct_color(match_change) }}>{fmt_pct(match_change)}</span>
          <span className="mono" style={{ color: pct_color(total_change), opacity: 0.75 }}>{fmt_pct(total_change)}</span>
        </span>
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
              background: c.is_goal ? "rgba(55,255,99,.05)" : "transparent",
              border: `1px solid ${c.is_goal ? "rgba(55,255,99,.1)" : "rgba(255,255,255,.03)"}`,
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
