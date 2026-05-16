// Repository bootstrap, split by auth requirement.
//
// - ``init_public_repositories``  → no auth required (teams, players,
//   fixtures, valuations, screener, news, matches). Runs for every
//   visitor including anonymous ones.
// - ``init_authenticated_repositories``  → require a logged-in session
//   (portfolio, trades). Called after login / on app boot when
//   ``/api/auth/me`` returns a user.

import { init_fixtures_repository } from "@/infrastructure/repositories/fixtures_repository";
import { init_leagues_repository } from "@/infrastructure/repositories/leagues_repository";
import { init_matches_repository } from "@/infrastructure/repositories/matches_repository";
import { init_news_repository } from "@/infrastructure/repositories/news_repository";
import { init_players_repository } from "@/infrastructure/repositories/players_repository";
import { init_portfolio_repository } from "@/infrastructure/repositories/portfolio_repository";
import { init_screener_repository } from "@/infrastructure/repositories/screener_repository";
import { init_teams_repository } from "@/infrastructure/repositories/teams_repository";
import { init_trades_repository } from "@/infrastructure/repositories/trades_repository";
import { init_valuations_repository } from "@/infrastructure/repositories/valuations_repository";

export async function init_public_repositories(): Promise<void> {
  await Promise.all([
    init_teams_repository(),
    init_players_repository(),
    init_fixtures_repository(),
    init_valuations_repository(),
    init_screener_repository(),
  ]);
  await Promise.all([init_news_repository(), init_matches_repository()]);
}

export async function init_authenticated_repositories(): Promise<void> {
  await Promise.all([
    init_portfolio_repository(),
    init_trades_repository(),
    init_leagues_repository(),
  ]);
}
