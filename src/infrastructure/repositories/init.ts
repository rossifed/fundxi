// Bootstrap: prime all backend-fed repository caches in parallel before the
// app's UI starts rendering data-bound pages. Mocks (leagues only) initialize
// themselves at module load and need no action.

import { init_fixtures_repository } from "@/infrastructure/repositories/fixtures_repository";
import { init_matches_repository } from "@/infrastructure/repositories/matches_repository";
import { init_news_repository } from "@/infrastructure/repositories/news_repository";
import { init_players_repository } from "@/infrastructure/repositories/players_repository";
import { init_portfolio_repository } from "@/infrastructure/repositories/portfolio_repository";
import { init_screener_repository } from "@/infrastructure/repositories/screener_repository";
import { init_teams_repository } from "@/infrastructure/repositories/teams_repository";
import { init_trades_repository } from "@/infrastructure/repositories/trades_repository";
import { init_valuations_repository } from "@/infrastructure/repositories/valuations_repository";

export async function bootstrap_repositories(): Promise<void> {
  // First wave: independent repos.
  await Promise.all([
    init_teams_repository(),
    init_players_repository(),
    init_fixtures_repository(),
    init_valuations_repository(),
    init_screener_repository(),
  ]);
  // Second wave: depend on the first (news/matches enrich via fixtures+teams,
  // trades enrich via players, portfolio is independent of the first wave).
  await Promise.all([
    init_news_repository(),
    init_matches_repository(),
    init_portfolio_repository(),
    init_trades_repository(),
  ]);
}
