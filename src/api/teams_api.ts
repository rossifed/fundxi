import type { Team } from "@/domain/team/team";
import { teams_repository } from "@/infrastructure/repositories/teams_repository";
import { fetch_team_squad, type SquadPlayer } from "@/infrastructure/repositories/team_squad_repository";

export type { SquadPlayer };

export const teams_api = {
  list(): Team[] {
    return teams_repository.find_all();
  },
  get(id: string): Team | undefined {
    return teams_repository.find_by_id(id);
  },
  /** Async — the team's players, each with its live valuation. */
  fetch_squad(team_id: string): Promise<SquadPlayer[]> {
    return fetch_team_squad(team_id);
  },
};
