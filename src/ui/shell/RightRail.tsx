import { matches_api } from "@/api/matches_api";
import { players_api } from "@/api/players_api";
import { teams_api } from "@/api/teams_api";
import { valuations_api } from "@/api/valuations_api";
import type { Match } from "@/domain/match/match";
import type { Player } from "@/domain/player/player";
import { PlayerChip } from "@/ui/components/PlayerChip";
import { SectionHeader } from "@/ui/components/SectionHeader";

interface RightRailProps {
  watchlist: Set<number>;
  on_open_player: (player: Player) => void;
  on_open_match: (match: Match) => void;
}

export function RightRail({ watchlist, on_open_player, on_open_match }: RightRailProps) {
  const live = matches_api.get_live_match();
  const live_home = live ? teams_api.get(live.home_team_id) : undefined;
  const live_away = live ? teams_api.get(live.away_team_id) : undefined;
  const watched = players_api.list().filter(p => watchlist.has(p.id));

  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: "1px solid rgba(255,255,255,.04)",
        position: "sticky",
        top: 92,
        alignSelf: "flex-start",
        height: "calc(100vh - 92px)",
        overflowY: "auto",
        padding: "16px 16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      {/* Live ticker — compact 1-line */}
      {live && live_home && live_away && (
        <div
          onClick={() => on_open_match(live)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 12px",
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 9,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "rgba(255,255,255,.6)",
              animation: "pulse 1.5s infinite",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: 0.5 }}>LIVE</span>
          <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontWeight: 700 }}>{live.minute}'</span>
          <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700 }}>
            <span style={{ marginRight: 4 }}>{live_home.flag}</span>
            <span className="mono">{live.home_score}–{live.away_score}</span>
            <span style={{ marginLeft: 4 }}>{live_away.flag}</span>
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.3)" }}>›</span>
        </div>
      )}

      {/* Watchlist */}
      <div
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid rgba(255,255,255,.05)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <SectionHeader title="Watchlist" meta={`${watched.length} ★`} />
        {watched.length === 0 ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)", padding: "16px" }}>
            No watched players yet. Click the ★ on any player to track.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {watched.map((p, i) => {
              const team = teams_api.get(p.team_id);
              const v = valuations_api.get_for_player(p.id);
              const current_price = v?.current_price ?? 0;
              const change_24h = v?.change_24h ?? 0;
              const up = change_24h >= 0;
              return (
                <div
                  key={p.id}
                  onClick={() => on_open_player(p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderTop: i > 0 ? "1px solid rgba(255,255,255,.03)" : "none",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.025)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <PlayerChip jersey_number={p.jersey_number} team_color={team?.color ?? "#666"} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 4 }}>
                      <span>{team?.flag}</span>
                      <span>{team?.name}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>€{current_price}M</div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: up ? "#37ff63" : "#ff285d" }}>
                      {up ? "+" : ""}{change_24h}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
