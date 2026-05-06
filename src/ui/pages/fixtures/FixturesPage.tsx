import { useState } from "react";
import { matches_api } from "@/api/matches_api";
import { teams_api } from "@/api/teams_api";
import type { Fixture, FixtureStatus } from "@/domain/match/fixture";
import type { Match } from "@/domain/match/match";
import { LiveBadge } from "@/ui/components/LiveBadge";

type StatusFilter = "all" | FixtureStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "finished", label: "Completed" },
  { key: "upcoming", label: "Upcoming" },
];

interface FixturesPageProps {
  on_open_match: (match: Match) => void;
}

export function FixturesPage({ on_open_match }: FixturesPageProps) {
  const [filter, set_filter] = useState<StatusFilter>("all");
  const all = matches_api.list_fixtures();
  const fixtures = filter === "all" ? all : all.filter(f => f.status === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => set_filter(tab.key)}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: filter === tab.key ? 700 : 500,
              border: "1px solid rgba(255,255,255,.06)",
              cursor: "pointer",
              fontFamily: "inherit",
              background: filter === tab.key ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.02)",
              color: filter === tab.key ? "#fff" : "rgba(255,255,255,.45)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {fixtures.map(fx => {
          const home = teams_api.get(fx.home_team_id);
          const away = teams_api.get(fx.away_team_id);
          if (!home || !away) return null;
          const handle_click = async () => {
            const match = await matches_api.get_match_by_fixture_id(fx.id);
            if (match) on_open_match(match);
          };
          return (
            <FixtureCard
              key={fx.id}
              fixture={fx}
              home_flag={home.flag}
              home_name={home.name}
              away_flag={away.flag}
              away_name={away.name}
              clickable
              on_click={() => void handle_click()}
            />
          );
        })}
      </div>
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
            GROUP {fixture.group}
          </span>
        </div>
        {fixture.date && <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>{fixture.date}</span>}
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

      {fixture.note && (
        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 10 }}>
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
