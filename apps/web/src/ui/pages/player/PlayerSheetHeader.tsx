/* PlayerSheetHeader — the identity band of the player sheet (photo,
 * jersey, name, watch toggle, team link).
 *
 * DDD role: presentational UI component (no state, no I/O).
 */

import type { Player } from "@fundxi/core/domain/player/player";
import type { Team } from "@fundxi/core/domain/team/team";
import { PlayerAvatar } from "@/ui/components/PlayerAvatar";

interface PlayerSheetHeaderProps {
  player: Player;
  team: Team;
  is_watched: boolean;
  on_toggle_watch: () => void;
  on_open_team?: (team_id: string) => void;
}

export function PlayerSheetHeader({
  player,
  team,
  is_watched,
  on_toggle_watch,
  on_open_team,
}: PlayerSheetHeaderProps) {
  return (
    <div style={{ padding: "16px 24px 12px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <PlayerAvatar
          image_path={player.image_path}
          size={72}
          radius={10}
          fit="contain"
          alt={player.full_name ?? player.name}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              className="mono"
              style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: -0.5, color: "rgba(255,255,255,.55)" }}
            >
              {player.jersey_number}
            </span>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, letterSpacing: -0.5 }}>
              {player.full_name ?? player.name}
            </div>
            <button
              onClick={on_toggle_watch}
              aria-label={is_watched ? "Remove from watchlist" : "Add to watchlist"}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: is_watched ? "rgba(255,255,255,.08)" : "transparent",
                border: "1px solid rgba(255,255,255,.08)",
                color: is_watched ? "#fff" : "rgba(255,255,255,.5)",
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                alignSelf: "center",
              }}
            >
              {is_watched ? "★" : "☆"}
            </button>
          </div>
          <div
            onClick={on_open_team ? () => on_open_team(player.team_id) : undefined}
            title={on_open_team ? `View ${team.name}` : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
              fontSize: 13,
              color: "rgba(255,255,255,.65)",
              cursor: on_open_team ? "pointer" : "default",
            }}
          >
            {team.flag_url ? (
              <img src={team.flag_url} alt={team.name} style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }} />
            ) : team.flag ? (
              <span style={{ fontSize: 18, lineHeight: 1 }}>{team.flag}</span>
            ) : null}
            <span
              style={{
                fontWeight: 700,
                textDecoration: on_open_team ? "underline" : "none",
                textDecorationColor: "rgba(255,255,255,.25)",
                textUnderlineOffset: 3,
              }}
            >
              {team.name}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
