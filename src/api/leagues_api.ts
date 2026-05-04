import type { League } from "@/domain/league/league";
import { leagues_repository } from "@/infrastructure/repositories/leagues_repository";

export const leagues_api = {
  list(): League[] {
    return leagues_repository.find_all();
  },
  get(id: string): League | undefined {
    return leagues_repository.find_by_id(id);
  },
};
