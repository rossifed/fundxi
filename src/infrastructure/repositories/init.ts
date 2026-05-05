// Bootstrap: prime all backend-fed repository caches in parallel before the
// app's UI starts rendering data-bound pages. Mocks (portfolio, leagues,
// matches detail) initialize themselves at module load and need no action.

import { init_fixtures_repository } from "@/infrastructure/repositories/fixtures_repository";
import { init_news_repository } from "@/infrastructure/repositories/news_repository";
import { init_players_repository } from "@/infrastructure/repositories/players_repository";
import { init_teams_repository } from "@/infrastructure/repositories/teams_repository";
import { init_valuations_repository } from "@/infrastructure/repositories/valuations_repository";

export async function bootstrap_repositories(): Promise<void> {
  // First wave: independent repos (no cross-references).
  await Promise.all([
    init_teams_repository(),
    init_players_repository(),
    init_fixtures_repository(),
    init_valuations_repository(),
  ]);
  // Second wave: news enriches against fixtures + teams.
  await init_news_repository();
}
