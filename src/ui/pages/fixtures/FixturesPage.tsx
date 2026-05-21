import { useEffect, useMemo, useState } from "react";
import { matches_api } from "@/api/matches_api";
import { teams_api } from "@/api/teams_api";
import type { Fixture, FixtureStatus } from "@/domain/match/fixture";
import type { Match } from "@/domain/match/match";
import { build_bracket, type BracketLayout } from "@/domain/match/bracket";
import { LiveBadge } from "@/ui/components/LiveBadge";
import { useLiveRefetch, useMatchesLiveVersion } from "@/ui/hooks/use_live_updates";

type StatusFilter = "all" | FixtureStatus;
type ViewMode = "calendar" | "bracket";

const VIEW_MODE_STORAGE_KEY = "fundxi.fixtures.view_mode";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "finished", label: "Completed" },
  { key: "upcoming", label: "Upcoming" },
];

// Presentational mapping of Sportmonks stage labels → short chip text.
// Localization only — not data. Group Stage gets a richer composite label
// built from the team's group letter and the matchday round_name.
const STAGE_CHIP: Record<string, string> = {
  "Round of 16": "R16",
  "Quarter-finals": "QF",
  "Semi-finals": "SF",
  "3rd Place Final": "3RD",
  Final: "FINAL",
};

interface FixturesPageProps {
  on_open_match: (match: Match) => void;
}

interface DayGroup {
  day_key: string;
  day_label: string;
  is_today: boolean;
  fixtures: Fixture[];
}

function today_key(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function group_by_day(fixtures: Fixture[]): DayGroup[] {
  const today = today_key();
  const groups = new Map<string, DayGroup>();
  for (const fx of fixtures) {
    const key = fx.date ? fx.date.slice(0, 10) : "tbd";
    let g = groups.get(key);
    if (!g) {
      g = {
        day_key: key,
        day_label: format_day_header(fx.date),
        is_today: key === today,
        fixtures: [],
      };
      groups.set(key, g);
    }
    g.fixtures.push(fx);
  }
  for (const g of groups.values()) g.fixtures.sort(compare_by_kickoff);
  return [...groups.values()].sort((a, b) => a.day_key.localeCompare(b.day_key));
}

function compare_by_kickoff(a: Fixture, b: Fixture): number {
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date.localeCompare(b.date);
}

function format_day_header(iso: string | undefined): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const month = d.toLocaleDateString(undefined, { month: "short" });
  const day = d.getDate();
  return `${weekday} · ${month} ${day}`.toUpperCase();
}

function format_kickoff_time(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function format_short_date(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }).toUpperCase();
}

function is_knockout_day(day: DayGroup): boolean {
  return day.fixtures.length > 0 && day.fixtures.every(fx => !!fx.stage_name && fx.stage_name !== "Group Stage");
}

function phase_chip(fixture: Fixture): string {
  if (fixture.stage_name === "Group Stage") {
    const md = fixture.round_name ? ` · MD${fixture.round_name}` : "";
    return fixture.group ? `GROUP ${fixture.group}${md}` : `GROUP${md}`;
  }
  if (fixture.stage_name && STAGE_CHIP[fixture.stage_name]) return STAGE_CHIP[fixture.stage_name];
  return "KO";
}

export function FixturesPage({ on_open_match }: FixturesPageProps) {
  const [filter, set_filter] = useState<StatusFilter>("all");
  const [view_mode, set_view_mode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "calendar";
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "bracket" ? "bracket" : "calendar";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, view_mode);
  }, [view_mode]);

  // Live: re-fetch fixtures on any global "match activity" tick. The
  // ``matches`` SSE topic fans out for every event/comment/status/lineup
  // change on any fixture — exactly the right granularity for this list.
  const [data_version, set_data_version] = useState(0);
  useLiveRefetch(useMatchesLiveVersion(), () => {
    void matches_api.refresh_fixtures().then(() => set_data_version(v => v + 1));
  });

  const all = useMemo(() => matches_api.list_fixtures(), [data_version]);
  const fixtures = filter === "all" ? all : all.filter(f => f.status === filter);
  const days = group_by_day(fixtures);

  const handle_open = async (fx: Fixture) => {
    const match = await matches_api.get_match_by_fixture_id(fx.id);
    if (match) on_open_match(match);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => set_filter(tab.key)}
              disabled={view_mode === "bracket"}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: filter === tab.key ? 700 : 500,
                border: "1px solid rgba(255,255,255,.06)",
                cursor: view_mode === "bracket" ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                background: filter === tab.key ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.02)",
                color: filter === tab.key ? "#fff" : "rgba(255,255,255,.45)",
                opacity: view_mode === "bracket" ? 0.4 : 1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
          {(["calendar", "bracket"] as const).map(m => {
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
                {m === "calendar" ? "Calendar" : "Bracket"}
              </button>
            );
          })}
        </div>
      </div>

      {view_mode === "bracket" ? (
        <BracketView fixtures={all} on_open={handle_open} />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {days.map(day => (
          <section key={day.day_key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <header
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                padding: "6px 2px",
                background: "linear-gradient(to bottom, rgba(13,13,15,.95) 65%, rgba(13,13,15,0))",
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  fontSize: day.is_today ? 12 : 11,
                  letterSpacing: 1.2,
                  fontWeight: day.is_today ? 800 : 700,
                  color: day.is_today ? "#fff" : "rgba(255,255,255,.45)",
                }}
              >
                {day.day_label}
              </span>
              {day.is_today && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 1,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "var(--color-brand-green)",
                    color: "#0d0d0f",
                  }}
                >
                  TODAY
                </span>
              )}
              <span
                style={{
                  flex: 1,
                  height: 1,
                  background: day.is_today ? "rgba(72,255,67,.25)" : "rgba(255,255,255,.05)",
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  color: day.is_today ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.25)",
                  fontWeight: 600,
                }}
              >
                {day.fixtures.length}
              </span>
            </header>
            <div
              style={
                is_knockout_day(day)
                  ? {
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 440px)",
                      justifyContent: "center",
                      gap: 12,
                    }
                  : { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }
              }
            >
              {day.fixtures.map(fx => {
                const home = teams_api.get(fx.home_team_id);
                const away = teams_api.get(fx.away_team_id);
                if (!home || !away) return null;
                return (
                  <FixtureCard
                    key={fx.id}
                    fixture={fx}
                    home_flag={home.flag}
                    home_name={home.name}
                    away_flag={away.flag}
                    away_name={away.name}
                    clickable
                    on_click={() => void handle_open(fx)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
      )}
    </div>
  );
}

// Shared bracket styling so group columns and knockout columns read as
// the same visual family: every column is a bordered panel, every
// column header is a filled chip. White overlays only — theme-agnostic
// on the dark UI, no new palette colour (cf. FUNDXI-BRIEF).
const BRACKET_COL_PANEL: React.CSSProperties = {
  background: "rgba(255,255,255,.025)",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 8,
  padding: 6,
};

const BRACKET_COL_CHIP: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.4,
  fontWeight: 800,
  color: "rgba(255,255,255,.82)",
  textAlign: "center",
  padding: "5px 0",
  background: "rgba(255,255,255,.07)",
  borderRadius: 5,
};


function BracketView({ fixtures, on_open }: { fixtures: Fixture[]; on_open: (fx: Fixture) => void | Promise<void> }) {
  const by_group = new Map<string, Fixture[]>();
  for (const fx of fixtures) {
    if (fx.stage_name === "Group Stage" && fx.group) {
      const grp_list = by_group.get(fx.group) ?? [];
      grp_list.push(fx);
      by_group.set(fx.group, grp_list);
    }
  }
  for (const list of by_group.values()) list.sort(compare_by_kickoff);
  const group_letters = [...by_group.keys()].sort();
  const bracket = build_bracket(fixtures);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Group stage — 8 narrow columns, one per group, compact single-line cells */}
      {group_letters.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHeader label="GROUP STAGE" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${group_letters.length}, minmax(0, 1fr))`,
              gap: 8,
            }}
          >
            {group_letters.map(letter => (
              <div key={letter} style={{ ...BRACKET_COL_PANEL, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={BRACKET_COL_CHIP}>GROUP {letter}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(by_group.get(letter) ?? []).map(fx => (
                    <CompactMatchCell key={fx.id} fixture={fx} on_click={() => void on_open(fx)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mirrored knockout bracket */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionHeader label="KNOCKOUTS" />
        <MirroredBracket bracket={bracket} on_open={on_open} />
      </section>
    </div>
  );
}

/** Compact 2-row cell used in the bracket view (groups + KO).
 * Each team gets its own row (flag + code, score on the right). Today's
 * matches get an accent tint + green left border to pop out. */
function CompactMatchCell({ fixture, on_click }: { fixture: Fixture; on_click: () => void }) {
  const home = teams_api.get(fixture.home_team_id);
  const away = teams_api.get(fixture.away_team_id);
  const is_live = fixture.status === "live";
  const is_finished = fixture.status === "finished";
  const is_played = is_finished || is_live;
  const is_today = fixture.date ? fixture.date.slice(0, 10) === today_key() : false;
  const time = format_kickoff_time(fixture.date);

  const accent_bg = is_today ? "rgba(72,255,67,.10)" : is_live ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.05)";
  const accent_border = is_today ? "rgba(72,255,67,.40)" : is_live ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.11)";
  const tooltip = [
    format_short_date(fixture.date),
    time,
    fixture.venue_name,
  ].filter(Boolean).join(" · ");

  return (
    <div
      onClick={on_click}
      title={tooltip || undefined}
      style={{
        background: accent_bg,
        border: `1px solid ${accent_border}`,
        borderLeft: is_today ? "3px solid var(--color-brand-green)" : `1px solid ${accent_border}`,
        borderRadius: 6,
        padding: "5px 7px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <CellTeamRow flag={home?.flag} code={fixture.home_team_id} score={fixture.home_score} is_played={is_played} />
      <CellTeamRow flag={away?.flag} code={fixture.away_team_id} score={fixture.away_score} is_played={is_played} />
      {!is_played && (
        <div
          className="mono"
          style={{
            fontSize: 9,
            textAlign: "center",
            color: is_today ? "var(--color-brand-green)" : "rgba(255,255,255,.4)",
            fontWeight: 700,
            marginTop: 1,
          }}
        >
          {time || "·"}
        </div>
      )}
      {is_live && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            background: "linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)",
            animation: "glow 2s infinite",
          }}
        />
      )}
    </div>
  );
}

function CellTeamRow({
  flag,
  code,
  score,
  is_played,
}: {
  flag: string | undefined;
  code: string;
  score: number | undefined;
  is_played: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "20px minmax(0, 1fr) 18px",
        alignItems: "center",
        columnGap: 6,
        fontSize: 11,
        lineHeight: 1.1,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1, textAlign: "center" }}>{flag ?? ""}</span>
      <span style={{ fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {code}
      </span>
      <span
        className="mono"
        style={{
          textAlign: "right",
          fontWeight: 800,
          fontSize: 12,
          color: is_played ? "#fff" : "rgba(255,255,255,.25)",
        }}
      >
        {is_played ? (score ?? 0) : "-"}
      </span>
    </div>
  );
}

const BRACKET_COL_LABELS: { left: string; center?: string; right: string }[] = [
  { left: "R16", right: "R16" },
  { left: "QF", right: "QF" },
  { left: "SF", right: "SF" },
];

function MirroredBracket({
  bracket,
  on_open,
}: {
  bracket: BracketLayout;
  on_open: (fx: Fixture) => void | Promise<void>;
}) {
  // 7 columns: R16L | QFL | SFL | FINAL | SFR | QFR | R16R
  // Each column uses flex space-around so the cards' centers align to the
  // midpoints of their feeder column pairs — gives the canonical bracket
  // pyramid shape without drawing connector lines.
  const col_header = (label: string): React.ReactNode => (
    <div style={BRACKET_COL_CHIP}>{label}</div>
  );

  const col_style: React.CSSProperties = {
    ...BRACKET_COL_PANEL,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  };

  const cards_style = (count: number): React.CSSProperties => ({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: count <= 1 ? "center" : "space-around",
    gap: 6,
  });

  const render_slot = (fx: Fixture | null, key: string): React.ReactNode =>
    fx ? <CompactMatchCell key={key} fixture={fx} on_click={() => void on_open(fx)} /> : <EmptySlot key={key} />;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1.2fr 1fr 1fr 1fr",
          gap: 10,
          alignItems: "stretch",
          minHeight: 360,
        }}
      >
        {/* R16 left */}
        <div style={col_style}>
          {col_header(BRACKET_COL_LABELS[0].left)}
          <div style={cards_style(bracket.r16_left.length)}>
            {bracket.r16_left.map((fx, i) => render_slot(fx, `r16l-${i}`))}
          </div>
        </div>
        {/* QF left */}
        <div style={col_style}>
          {col_header(BRACKET_COL_LABELS[1].left)}
          <div style={cards_style(bracket.qf_left.length)}>
            {bracket.qf_left.map((fx, i) => render_slot(fx, `qfl-${i}`))}
          </div>
        </div>
        {/* SF left */}
        <div style={col_style}>
          {col_header(BRACKET_COL_LABELS[2].left)}
          <div style={cards_style(1)}>{render_slot(bracket.sf_left, "sfl")}</div>
        </div>
        {/* Final + trophy */}
        <div style={col_style}>
          <div style={BRACKET_COL_CHIP}>FINAL</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <TrophyImage />
            <div style={{ width: "100%" }}>{render_slot(bracket.final, "final")}</div>
            {bracket.third_place && (
              <>
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.2,
                    fontWeight: 700,
                    color: "rgba(255,255,255,.35)",
                    marginTop: 6,
                  }}
                >
                  3RD PLACE
                </div>
                <div style={{ width: "100%" }}>
                  {render_slot(bracket.third_place, "third")}
                </div>
              </>
            )}
          </div>
        </div>
        {/* SF right */}
        <div style={col_style}>
          {col_header(BRACKET_COL_LABELS[2].right)}
          <div style={cards_style(1)}>{render_slot(bracket.sf_right, "sfr")}</div>
        </div>
        {/* QF right */}
        <div style={col_style}>
          {col_header(BRACKET_COL_LABELS[1].right)}
          <div style={cards_style(bracket.qf_right.length)}>
            {bracket.qf_right.map((fx, i) => render_slot(fx, `qfr-${i}`))}
          </div>
        </div>
        {/* R16 right */}
        <div style={col_style}>
          {col_header(BRACKET_COL_LABELS[0].right)}
          <div style={cards_style(bracket.r16_right.length)}>
            {bracket.r16_right.map((fx, i) => render_slot(fx, `r16r-${i}`))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Renders the World Cup trophy image with an emoji fallback if the
 * file is missing. Source: ``public/wc-trophy.png`` (transparent
 * background, isolated trophy). */
function TrophyImage() {
  const [failed, set_failed] = useState(false);
  if (failed) {
    return (
      <span style={{ fontSize: 64, lineHeight: 1, filter: "drop-shadow(0 0 14px rgba(255,200,80,.25))" }}>🏆</span>
    );
  }
  return (
    <img
      src="/wc-trophy.png"
      alt="FIFA World Cup trophy"
      onError={() => set_failed(true)}
      style={{
        width: 110,
        height: 150,
        objectFit: "contain",
        filter: "drop-shadow(0 6px 22px rgba(255,200,80,.28))",
      }}
    />
  );
}

function EmptySlot() {
  return (
    <div
      style={{
        border: "1px dashed rgba(255,255,255,.06)",
        borderRadius: 5,
        height: 28,
      }}
    />
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
      <span style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700, color: "rgba(255,255,255,.5)" }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
    </div>
  );
}

function FixtureCard({
  fixture,
  home_flag,
  home_name,
  away_flag,
  away_name,
  clickable,
  on_click,
}: {
  fixture: Fixture;
  home_flag: string;
  home_name: string;
  away_flag: string;
  away_name: string;
  clickable: boolean;
  on_click: () => void;
}) {
  const is_live = fixture.status === "live";
  const is_finished = fixture.status === "finished";
  const kickoff_time = format_kickoff_time(fixture.date);
  const chip_label = phase_chip(fixture);

  return (
    <div
      onClick={on_click}
      style={{
        background: is_live ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.025)",
        border: `1px solid ${is_live ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.05)"}`,
        borderRadius: 12,
        padding: "16px 18px",
        cursor: clickable ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {is_live ? (
            <LiveBadge />
          ) : is_finished ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(255,255,255,.5)",
                background: "rgba(255,255,255,.06)",
                padding: "4px 9px",
                borderRadius: 5,
              }}
            >
              FT
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 600 }}>Upcoming</span>
          )}
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,.3)",
              background: "rgba(255,255,255,.04)",
              padding: "3px 7px",
              borderRadius: 4,
              fontWeight: 600,
              letterSpacing: 0.4,
            }}
          >
            {chip_label}
          </span>
        </div>
        {kickoff_time && (
          <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>{kickoff_time}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{home_name}</span>
          <span style={{ fontSize: 28 }}>{home_flag}</span>
        </div>
        {fixture.status !== "upcoming" ? (
          <div className="mono" style={{ fontSize: 26, fontWeight: 900, minWidth: 60, textAlign: "center", letterSpacing: -1.5 }}>
            {fixture.home_score} : {fixture.away_score}
          </div>
        ) : (
          <div className="mono" style={{ fontSize: 14, color: "rgba(255,255,255,.2)", fontWeight: 700, minWidth: 60, textAlign: "center" }}>
            VS
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <span style={{ fontSize: 28 }}>{away_flag}</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{away_name}</span>
        </div>
      </div>

      {(fixture.venue_name || fixture.note) && (
        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 10 }}>
          {fixture.venue_name}
          {fixture.venue_name && fixture.note ? " · " : ""}
          {fixture.note}
        </div>
      )}
      {is_live && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: "linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)",
            animation: "glow 2s infinite",
          }}
        />
      )}
    </div>
  );
}
