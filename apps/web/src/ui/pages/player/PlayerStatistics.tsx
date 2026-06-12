/* PlayerStatistics — the grouped tournament-stats panel of the player sheet.
 *
 * DDD role: React presentation (no state, no I/O). Renders the view-model
 * produced by build_tournament_stat_groups (shared with mobile for parity);
 * the only client-specific concern here is mapping a StatSemantic to a colour
 * token. Each family shows only the KPIs the provider actually sent.
 */

import { build_tournament_stat_groups, type StatSemantic } from "@fundxi/core/domain/player/player_stat_view";
import type { PlayerTournamentStat } from "@fundxi/core/infrastructure/repositories/player_stats_repository";
import { color } from "@/ui/design/tokens";
import { SectionCard, SmallKpi } from "@/ui/pages/player/player_sheet_ui";

function semantic_color(semantic: StatSemantic): string | undefined {
  switch (semantic) {
    case "good":
      return color.positive;
    case "warn":
      return color.cardYellow;
    case "danger":
      return color.negative;
    default:
      return undefined;
  }
}

export function PlayerStatistics({ stats }: { stats: PlayerTournamentStat }) {
  const groups = build_tournament_stat_groups(stats);
  if (groups.length === 0) return null;

  return (
    <SectionCard title="Statistics">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: "1px solid rgba(255,255,255,.05)",
          borderTop: "none",
        }}
      >
        {groups.map(group => (
          <div key={group.title}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "rgba(255,255,255,.4)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                padding: "7px 10px 4px",
              }}
            >
              {group.title}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
              {group.items.map(item => (
                <SmallKpi
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  color={semantic_color(item.semantic)}
                  title={item.title}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
