/* TeamPage — the per-team hub.
 *
 * DDD role: React presentation (page). A destination you navigate to
 * (reached via App's ``selected_team`` state, like MatchView) — header,
 * tournament record, squad as cards, and the team's fixtures.
 *
 * Every value is real provider data already in the DB: team identity
 * (core.team), record (core.standings), squad + prices
 * (/api/players/search), fixtures (core.fixture). Nothing synthesised.
 *
 * Live: squad prices refresh on the shared live-valuations stream;
 * the record refreshes on the ``standings`` SSE topic; fixtures on the
 * ``matches`` topic.
 */

import { useEffect, useMemo, useState } from "react";
import { matches_api } from "@/api/matches_api";
import { standings_api, type StandingRow } from "@/api/standings_api";
import { teams_api, type SquadPlayer } from "@/api/teams_api";
import type { Fixture } from "@/domain/match/fixture";
import type { Match } from "@/domain/match/match";
import type { Position } from "@/domain/player/player";
import type { Team } from "@/domain/team/team";
import { PlayerCard } from "@/ui/components/PlayerCard";
import { color_for_sign } from "@/ui/helpers/format";
import { useLiveRefetch, useMatchesLiveVersion, useStandingsLiveVersion } from "@/ui/hooks/use_live_updates";
import { useLiveValuations } from "@/ui/hooks/use_live_valuations";

interface TeamPageProps {
  team: Team;
  on_open_player: (player_id: number) => void;
  on_open_match: (match: Match) => void;
  on_back: () => void;
}

function fmt_match_date(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function TeamPage({ team, on_open_player, on_open_match, on_back }: TeamPageProps) {
  const live_valuations = useLiveValuations();
  const standings_version = useStandingsLiveVersion();
  const [fixtures_version, set_fixtures_version] = useState(0);
  useLiveRefetch(useMatchesLiveVersion(), () => {
    void matches_api.refresh_fixtures().then(() => set_fixtures_version(v => v + 1));
  });

  // Squad — refetched on every shared price-tick wave so the cards stay live.
  const [squad, set_squad] = useState<SquadPlayer[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void teams_api.fetch_squad(team.id).then(players => {
      if (!cancelled) set_squad(players);
    });
    return () => {
      cancelled = true;
    };
  }, [team.id, live_valuations]);

  // Tournament record — the team's row in the group standings.
  const [standing, set_standing] = useState<StandingRow | null>(null);
  useEffect(() => {
    let cancelled = false;
    void standings_api.list().then(groups => {
      if (cancelled) return;
      for (const g of groups) {
        const row = g.rows.find(r => r.team_id === team.id);
        if (row) {
          set_standing(row);
          return;
        }
      }
      set_standing(null);
    });
    return () => {
      cancelled = true;
    };
  }, [team.id, standings_version]);

  // The team's fixtures (home or away), oldest-first.
  const fixtures = useMemo(() => {
    return matches_api
      .list_fixtures()
      .filter(f => f.home_team_id === team.id || f.away_team_id === team.id)
      .slice()
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id, fixtures_version]);

  const open_fixture = async (fx: Fixture) => {
    const match = await matches_api.get_match_by_fixture_id(fx.id);
    if (match) on_open_match(match);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <button
        type="button"
        onClick={on_back}
        style={{
          alignSelf: "flex-start",
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.07)",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(255,255,255,.6)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        ← Back
      </button>

      <TeamHeader team={team} standing={standing} />
      {standing && <RecordStrip standing={standing} />}

      <Section title={`Squad${squad ? ` · ${squad.length}` : ""}`}>
        {squad === null ? (
          <Muted>Loading squad…</Muted>
        ) : squad.length === 0 ? (
          <Muted>No players found for this team.</Muted>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {squad.map(p => (
              <PlayerCard
                key={p.id}
                name={p.name}
                jersey_number={p.jersey_number}
                position={p.position as Position}
                image_path={p.image_path}
                team_color={team.color}
                current_price={p.valuation.current_price}
                change_pct={p.valuation.change_since_inception}
                on_click={() => on_open_player(p.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={`Fixtures · ${fixtures.length}`}>
        {fixtures.length === 0 ? (
          <Muted>No fixtures for this team.</Muted>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fixtures.map(fx => (
              <TeamFixtureRow key={fx.id} fixture={fx} team_id={team.id} on_click={() => void open_fixture(fx)} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function TeamHeader({ team, standing }: { team: Team; standing: StandingRow | null }) {
  const sub: string[] = [];
  if (team.confederation) sub.push(team.confederation);
  if (team.group) sub.push(`Group ${team.group}`);
  if (standing) sub.push(`${ordinal(standing.position)} in group`);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "18px 20px",
        background: `linear-gradient(120deg, ${team.color}26, rgba(255,255,255,.02))`,
        border: "1px solid rgba(255,255,255,.06)",
        borderRadius: 12,
      }}
    >
      {team.flag_url ? (
        <img src={team.flag_url} alt="" style={{ width: 52, height: 52, objectFit: "contain", flexShrink: 0 }} />
      ) : (
        <span style={{ fontSize: 46, lineHeight: 1 }}>{team.flag}</span>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4 }}>{team.name}</div>
        {sub.length > 0 && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", fontWeight: 600, marginTop: 2 }}>
            {sub.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function RecordStrip({ standing }: { standing: StandingRow }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gap: 1,
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.06)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <RecordCell label="Played" value={standing.played} />
      <RecordCell label="Won" value={standing.won} />
      <RecordCell label="Drawn" value={standing.drawn} />
      <RecordCell label="Lost" value={standing.lost} />
      <RecordCell label="GF" value={standing.goals_for} />
      <RecordCell label="GA" value={standing.goals_against} />
      <RecordCell
        label="GD"
        value={`${standing.goal_difference > 0 ? "+" : ""}${standing.goal_difference}`}
        color={color_for_sign(standing.goal_difference)}
      />
      <RecordCell label="Points" value={standing.points} emphasis />
    </div>
  );
}

function RecordCell({
  label,
  value,
  color,
  emphasis,
}: {
  label: string;
  value: string | number;
  color?: string;
  emphasis?: boolean;
}) {
  return (
    <div style={{ background: "rgba(13,13,15,.6)", padding: "12px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: emphasis ? 20 : 17, fontWeight: 800, marginTop: 3, color: color ?? "#fff" }}
      >
        {value}
      </div>
    </div>
  );
}

function TeamFixtureRow({
  fixture,
  team_id,
  on_click,
}: {
  fixture: Fixture;
  team_id: string;
  on_click: () => void;
}) {
  const is_home = fixture.home_team_id === team_id;
  const opponent_id = is_home ? fixture.away_team_id : fixture.home_team_id;
  const opponent = teams_api.get(opponent_id);
  const is_played = fixture.status === "finished" || fixture.status === "live";
  // Score is always shown home–away; reorder so the team's goals are first.
  const own = is_home ? fixture.home_score : fixture.away_score;
  const opp = is_home ? fixture.away_score : fixture.home_score;
  const time = fixture.date
    ? new Date(fixture.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div
      onClick={on_click}
      style={{
        display: "grid",
        gridTemplateColumns: "70px 24px 1fr 70px 56px",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 13,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.045)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,.02)")}
    >
      <span className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
        {fmt_match_date(fixture.date)}
      </span>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)", fontWeight: 700 }}>
        {is_home ? "vs" : "@"}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: 16 }}>{opponent?.flag ?? ""}</span>
        <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {opponent?.name ?? opponent_id}
        </span>
      </span>
      <span
        className="mono"
        style={{ textAlign: "center", fontWeight: 800, color: is_played ? "#fff" : "rgba(255,255,255,.3)" }}
      >
        {is_played ? `${own ?? 0} – ${opp ?? 0}` : time || "—"}
      </span>
      <span
        style={{
          textAlign: "right",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.4,
          color:
            fixture.status === "live"
              ? "var(--color-positive)"
              : "rgba(255,255,255,.35)",
        }}
      >
        {fixture.status === "live" ? "LIVE" : fixture.status === "finished" ? "FT" : "UPCOMING"}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "rgba(255,255,255,.5)",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.3)" }}>
      {children}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
