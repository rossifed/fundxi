import { players_api } from "@fundxi/core/api/players_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import type { Match } from "@fundxi/core/domain/match/match";
import type { Player } from "@fundxi/core/domain/player/player";
import { PlayerAvatar } from "@/ui/components/PlayerAvatar";
import { SectionHeader } from "@/ui/components/SectionHeader";
import { TeamLink } from "@/ui/components/TeamLink";
import { TickValue } from "@/ui/components/TickValue";
import { fmt_live_minute } from "@/ui/helpers/format";
import { useLiveMatch } from "@/ui/hooks/use_live_match";

interface RightRailProps {
  watchlist: Set<number>;
  on_open_player: (player: Player) => void;
  on_open_match: (match: Match) => void;
  on_open_team?: (team_id: string) => void;
}

export function RightRail({ watchlist, on_open_player, on_open_match, on_open_team }: RightRailProps) {
  const live = useLiveMatch();
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
          <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontWeight: 700 }}>{fmt_live_minute(live.minute)}</span>
          <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700 }}>
            <TeamLink team_id={live.home_team_id} on_open_team={on_open_team} style={{ marginRight: 4 }}>
              {live_home.flag}
            </TeamLink>
            <span className="mono">{live.home_score}–{live.away_score}</span>
            <TeamLink team_id={live.away_team_id} on_open_team={on_open_team} style={{ marginLeft: 4 }}>
              {live_away.flag}
            </TeamLink>
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
              const change_pct = v?.change_since_inception ?? 0;
              const up = change_pct >= 0;
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
                  <PlayerAvatar
                    image_path={p.image_path}
                    jersey_number={p.jersey_number}
                    team_color={team?.color ?? "#666"}
                    size={30}
                    radius={6}
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
                      style={{ fontSize: 10, color: "rgba(255,255,255,.3)", display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <span>{team?.flag}</span>
                      <span>{team?.name}</span>
                    </TeamLink>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                      <TickValue value={current_price}>€{current_price}M</TickValue>
                    </div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: up ? "var(--color-positive)" : "var(--color-negative)" }}>
                      {up ? "+" : ""}{change_pct}%
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
