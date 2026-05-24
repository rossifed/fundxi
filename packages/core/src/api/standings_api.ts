/* standings_api — UI contract surface for group-stage tables. */

import {
  fetch_standings,
  type GroupStanding,
  type StandingRow,
} from "@fundxi/core/infrastructure/repositories/standings_repository";

export type { GroupStanding, StandingRow };

export const standings_api = {
  /** Every group's table for the active tournament, newest-first by points. */
  list(): Promise<GroupStanding[]> {
    return fetch_standings();
  },
};
