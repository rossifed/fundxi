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
import { matches_api } from "@fundxi/core/api/matches_api";
import { players_api } from "@fundxi/core/api/players_api";
import { standings_api, type StandingRow } from "@fundxi/core/api/standings_api";
import { teams_api, type SquadPlayer } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import type { Fixture } from "@fundxi/core/domain/match/fixture";
import type { Match } from "@fundxi/core/domain/match/match";
import type { Player, Position } from "@fundxi/core/domain/player/player";
import type { Team } from "@fundxi/core/domain/team/team";
import { AuthDialog } from "@/ui/components/AuthDialog";
import { PlayerCard } from "@/ui/components/PlayerCard";
import { TeamLink } from "@/ui/components/TeamLink";
import { TradeDialog } from "@/ui/components/TradeDialog";
import { position_color } from "@/ui/design/tokens";
import { color_for_sign, fmt_eur_m } from "@/ui/helpers/format";
import { useLiveRefetch, useMatchesLiveVersion, useStandingsLiveVersion } from "@/ui/hooks/use_live_updates";
import { useLiveValuations } from "@/ui/hooks/use_live_valuations";
import { useAuth } from "@/ui/shell/AuthContext";

// Squad sections, in pitch order.
const POSITION_GROUPS: { key: Position; label: string }[] = [
  { key: "GK", label: "Goalkeepers" },
  { key: "DF", label: "Defenders" },
  { key: "MF", label: "Midfielders" },
  { key: "FW", label: "Forwards" },
];

interface TeamPageProps {
  team: Team;
  on_open_player: (player_id: number) => void;
  on_open_match: (match: Match) => void;
  on_open_team?: (team_id: string) => void;
  on_back: () => void;
}

function fmt_match_date(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function TeamPage({ team, on_open_player, on_open_match, on_open_team, on_back }: TeamPageProps) {
  // Subscribe to the shared live-valuations stream: this component
  // re-renders on every price-tick wave, and the squad cards read fresh
  // prices from the shared cache below — no per-tick squad refetch.
  useLiveValuations();
  const standings_version = useStandingsLiveVersion();
  const [fixtures_version, set_fixtures_version] = useState(0);
  // Quick-trade from a flipped squad card — one shared TradeDialog,
  // gated on auth exactly like PlayerSheet.
  const [trade_player, set_trade_player] = useState<Player | null>(null);
  const [trade_kind, set_trade_kind] = useState<"buy" | "sell" | null>(null);
  const [auth_prompt_open, set_auth_prompt_open] = useState(false);
  const { status: auth_status } = useAuth();
  useLiveRefetch(useMatchesLiveVersion(), () => {
    void matches_api.refresh_fixtures().then(() => set_fixtures_version(v => v + 1));
  });

  // Squad — fetched ONCE per team. Live prices are overlaid at render
  // time from the shared valuations cache; only the static identity and
  // tournament-cumulative stats come from this snapshot.
  const [squad, set_squad] = useState<SquadPlayer[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void teams_api.fetch_squad(team.id).then(players => {
      if (!cancelled) set_squad(players);
    });
    return () => {
      cancelled = true;
    };
  }, [team.id]);

  // Tournament record — the team's row in the group standings.
  const [standing, set_standing] = useState<StandingRow | null>(null);
  // The team's group letter — a standings concept, read from the standings
  // (never stored on the team, never hardcoded in the frontend).
  const [team_group, set_team_group] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void standings_api.list().then(groups => {
      if (cancelled) return;
      for (const g of groups) {
        const row = g.rows.find(r => r.team_id === team.id);
        if (row) {
          set_standing(row);
          set_team_group(g.group);
          return;
        }
      }
      set_standing(null);
      set_team_group(null);
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

  // Resolve the domain Player and open the same TradeDialog PlayerSheet
  // uses — gated on auth: anonymous users get the register/login prompt.
  const open_trade = (player_id: number, kind: "buy" | "sell") => {
    if (auth_status === "authenticated") {
      const player = players_api.get(player_id);
      if (player) {
        set_trade_player(player);
        set_trade_kind(kind);
      }
    } else if (auth_status === "anonymous") {
      set_auth_prompt_open(true);
    }
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

      <TeamHeader team={team} standing={standing} group={team_group} />
      {standing && <RecordStrip standing={standing} />}
      {squad && squad.length > 0 && <SquadSummary squad={squad} />}

      <Section title={`Squad${squad ? ` · ${squad.length}` : ""}`}>
        {squad === null ? (
          <Muted>Loading squad…</Muted>
        ) : squad.length === 0 ? (
          <Muted>No players found for this team.</Muted>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {POSITION_GROUPS.map(grp => {
              const players = squad.filter(p => p.position === grp.key);
              if (players.length === 0) return null;
              const accent = position_color[grp.key];
              return (
                // Each position is its own bordered panel with a tinted
                // header band — same grouping pattern as the Calendar
                // day panels and the bracket pools.
                <section
                  key={grp.key}
                  style={{
                    background: "rgba(255,255,255,.02)",
                    border: "1px solid rgba(255,255,255,.06)",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <header
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "10px 14px",
                      background: `${accent}16`,
                      borderBottom: `1px solid ${accent}33`,
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: accent, flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        color: "#fff",
                      }}
                    >
                      {grp.label}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "rgba(255,255,255,.6)",
                        background: "rgba(0,0,0,.25)",
                        borderRadius: 20,
                        padding: "2px 8px",
                      }}
                    >
                      {players.length}
                    </span>
                  </header>
                  {/* One horizontally-scrolling row per position group — the
                      cards keep their style but are smaller, so a whole
                      position line scans at a glance and scrolls sideways. */}
                  <div
                    className="scroll-visible"
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: 12,
                      overflowX: "auto",
                    }}
                  >
                    {players.map(p => {
                      // Live price overlaid from the shared valuations
                      // cache (refreshed once per tick wave); the squad
                      // snapshot only seeds the fallback.
                      const live = valuations_api.get_for_player(p.id);
                      return (
                        <div key={p.id} style={{ flexShrink: 0, width: 146 }}>
                          <PlayerCard
                            name={p.name}
                            jersey_number={p.jersey_number}
                            position={p.position as Position}
                            image_path={p.image_path}
                            team_color={team.color}
                            age={p.age}
                            height={p.height}
                            weight={p.weight}
                            current_price={live?.current_price ?? p.valuation.current_price}
                            change_pct={live?.change_since_inception ?? p.valuation.change_since_inception}
                            stats={p.stats}
                            spark_data={valuations_api.get_sparkline(p.id)}
                            on_click={() => on_open_player(p.id)}
                            on_trade={kind => open_trade(p.id, kind)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={`Fixtures · ${fixtures.length}`}>
        {fixtures.length === 0 ? (
          <Muted>No fixtures for this team.</Muted>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fixtures.map(fx => (
              <TeamFixtureRow
                key={fx.id}
                fixture={fx}
                team_id={team.id}
                on_open_team={on_open_team}
                on_click={() => void open_fixture(fx)}
              />
            ))}
          </div>
        )}
      </Section>

      {trade_player && (
        <TradeDialog
          open={trade_kind !== null}
          player={trade_player}
          initial_kind={trade_kind ?? "buy"}
          on_close={() => set_trade_kind(null)}
        />
      )}
      {auth_prompt_open && (
        <AuthDialog initial_mode="register" on_close={() => set_auth_prompt_open(false)} />
      )}
    </div>
  );
}

function TeamHeader({
  team,
  standing,
  group,
}: {
  team: Team;
  standing: StandingRow | null;
  group: string | null;
}) {
  const sub: string[] = [];
  if (team.continent) sub.push(team.continent);
  if (group) sub.push(`Group ${group}`);
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
        {team.coach_name && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8 }}>
            {team.coach_image_path && (
              <img
                src={team.coach_image_path}
                alt=""
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  objectFit: "cover",
                  flexShrink: 0,
                  border: "1px solid rgba(255,255,255,.12)",
                }}
              />
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.6)" }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,.35)",
                  marginRight: 5,
                }}
              >
                Coach
              </span>
              {team.coach_name}
            </span>
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

/** Total squad value — switches to billions once past 1000M. */
function fmt_squad_value(value_m: number): string {
  return value_m >= 1000 ? `€${(value_m / 1000).toFixed(2)}B` : `€${Math.round(value_m)}M`;
}

/** Last token of a display name — fits a player into a narrow cell. */
function last_word(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

/** Squad overview — every figure is an aggregate of the squad already
 * loaded (real persisted data), not a synthesised value. */
function SquadSummary({ squad }: { squad: SquadPlayer[] }) {
  const total_value = squad.reduce((sum, p) => sum + p.valuation.current_price, 0);

  const ages = squad.map(p => p.age).filter((a): a is number => a != null);
  const avg_age = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : null;

  let top_scorer: SquadPlayer | null = null;
  for (const p of squad) {
    if ((p.stats?.goals ?? 0) > (top_scorer?.stats?.goals ?? 0)) top_scorer = p;
  }
  const top_goals = top_scorer?.stats?.goals ?? 0;

  let top_value: SquadPlayer | null = null;
  for (const p of squad) {
    if (p.valuation.current_price > (top_value?.valuation.current_price ?? -Infinity)) top_value = p;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 1,
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.06)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <SummaryCell label="Squad value" main={fmt_squad_value(total_value)} />
      <SummaryCell label="Avg age" main={avg_age != null ? avg_age.toFixed(1) : "—"} />
      <SummaryCell
        label="Top scorer"
        main={top_goals > 0 && top_scorer ? last_word(top_scorer.name) : "—"}
        sub={top_goals > 0 ? `${top_goals} ${top_goals === 1 ? "goal" : "goals"}` : undefined}
      />
      <SummaryCell
        label="Top value"
        main={top_value ? last_word(top_value.name) : "—"}
        sub={top_value ? fmt_eur_m(top_value.valuation.current_price) : undefined}
      />
    </div>
  );
}

function SummaryCell({ label, main, sub }: { label: string; main: string; sub?: string }) {
  return (
    <div style={{ background: "rgba(13,13,15,.6)", padding: "11px 8px", textAlign: "center", minWidth: 0 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "rgba(255,255,255,.35)",
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 16,
          fontWeight: 800,
          marginTop: 3,
          color: "#fff",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {main}
      </div>
      {sub && (
        <div style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,.4)", marginTop: 1 }}>{sub}</div>
      )}
    </div>
  );
}

function TeamFixtureRow({
  fixture,
  team_id,
  on_open_team,
  on_click,
}: {
  fixture: Fixture;
  team_id: string;
  on_open_team?: (team_id: string) => void;
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

  // Sub-line — tournament phase + stadium, both real provider data.
  const stage_label = fixture.stage_name
    ? fixture.round_name
      ? `${fixture.stage_name} · MD ${fixture.round_name}`
      : fixture.stage_name
    : null;
  const venue_label = fixture.venue_name
    ? fixture.venue_city
      ? `${fixture.venue_name}, ${fixture.venue_city}`
      : fixture.venue_name
    : null;
  const meta = [stage_label, venue_label].filter(Boolean).join("  ·  ");

  return (
    <div
      onClick={on_click}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "70px 24px 1fr 70px 56px",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
          {fmt_match_date(fixture.date)}
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)", fontWeight: 700 }}>
          {is_home ? "vs" : "@"}
        </span>
        <TeamLink
          team_id={opponent_id}
          on_open_team={on_open_team}
          style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}
        >
          <span style={{ fontSize: 16 }}>{opponent?.flag ?? ""}</span>
          <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {opponent?.name ?? opponent_id}
          </span>
        </TeamLink>
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
            color: fixture.status === "live" ? "var(--color-positive)" : "rgba(255,255,255,.35)",
          }}
        >
          {fixture.status === "live" ? "LIVE" : fixture.status === "finished" ? "FT" : "UPCOMING"}
        </span>
      </div>

      {meta && (
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "rgba(255,255,255,.4)",
            paddingLeft: 80,
          }}
        >
          {meta}
        </div>
      )}
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
