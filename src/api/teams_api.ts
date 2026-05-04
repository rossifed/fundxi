import type { Team } from "@/domain/team/team";
import { teams_repository } from "@/infrastructure/repositories/teams_repository";

export const teams_api = {
  list(): Team[] {
    return teams_repository.find_all();
  },
  get(id: string): Team | undefined {
    return teams_repository.find_by_id(id);
  },
};
