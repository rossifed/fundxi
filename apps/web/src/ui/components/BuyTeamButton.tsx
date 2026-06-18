// BuyTeamButton — "buy the team" entry, a thin wrapper over the generic
// BasketButton.
//
// DDD role: UI presentation. Adds the only team-specific concerns — lazily
// fetching the squad and mapping it to basket candidates — then delegates the
// button + dialog + auth gate to BasketButton. Used by TeamPage (passes its
// loaded squad) and MatchView (per selected team, lazy-fetches). The dialog
// widget and the trade logic live elsewhere and are never duplicated here.

import { useEffect, useState } from "react";
import { teams_api, type SquadPlayer } from "@fundxi/core/api/teams_api";
import { valuations_api } from "@fundxi/core/api/valuations_api";
import type { Position } from "@fundxi/core/domain/player/player";
import type { Team } from "@fundxi/core/domain/team/team";
import { BasketButton } from "@/ui/components/BasketButton";
import type { BasketCandidate } from "@/ui/components/BasketDialog";

interface BuyTeamButtonProps {
  team: Team;
  on_open_player: (player_id: number) => void;
  // Pre-fetched squad when the caller already has it (TeamPage). Omit to lazily
  // fetch on first open (MatchView).
  squad?: SquadPlayer[] | null;
}

/** Map a squad to the basket's candidate shape. Values/stats are read live from
 * the valuation cache (snapshot fallback) — the SAME source the basket sizing
 * reads, so rows and legs agree. */
function to_candidates(squad: SquadPlayer[]): BasketCandidate[] {
  return squad.map(p => ({
    id: p.id,
    name: p.name,
    position: p.position as Position,
    jersey_number: p.jersey_number,
    image_path: p.image_path,
    value: valuations_api.get_for_player(p.id)?.current_price ?? p.valuation.current_price,
    appearances: p.stats?.appearances ?? null,
    minutes_played: p.stats?.minutes_played ?? null,
    change_since_inception:
      valuations_api.get_for_player(p.id)?.change_since_inception ?? p.valuation.change_since_inception,
  }));
}

export function BuyTeamButton({ team, on_open_player, squad }: BuyTeamButtonProps) {
  const [fetched, set_fetched] = useState<SquadPlayer[] | null>(null);

  // The same instance is reused when the caller swaps `team` (match view's
  // home/away selector) — invalidate the cached squad so the next open fetches
  // THIS team, never the previously loaded one.
  useEffect(() => {
    set_fetched(null);
  }, [team.id]);

  const squad_data = squad ?? fetched;

  return (
    <BasketButton
      label="+ Buy team"
      title={`Buy ${team.name}`}
      accent={team.color}
      candidates={squad_data ? to_candidates(squad_data) : []}
      on_open_player={on_open_player}
      title_text="Buy several players of this team in one go — pick a % of your cash, split equally or by total value across the squad. You review and deselect players before confirming."
      on_open={() => {
        if (!squad_data) void teams_api.fetch_squad(team.id).then(set_fetched);
      }}
    />
  );
}
