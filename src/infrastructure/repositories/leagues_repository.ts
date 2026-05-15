import type { League } from "@/domain/league/league";

/* Leagues — empty until the backend League CRUD lands.
 *
 * Previously this module shipped hardcoded leagues with fake user names
 * (``ElGauchito`` / ``SambaCapital`` / etc.) and made-up leaderboards.
 * That violated the "no synthetic data" rule of the project. Leagues are
 * user-created: when the user signs up and creates / joins a league via
 * the upcoming ``/api/leagues`` endpoints, this repo will fetch real
 * data via ``api_get`` like every other repo. */

const LEAGUES: League[] = [];

export const leagues_repository = {
  find_all(): League[] {
    return LEAGUES;
  },
  find_by_id(id: string): League | undefined {
    return LEAGUES.find(l => l.id === id);
  },
};
