"""Read-side Application Services (Use Cases).

DDD roles:
- Module-level async functions = Application Services / Use Cases. Pure
  orchestration over Repository + ValuationProvider ports.
- `PlayerWithValuation` DTO — query result composition, not a domain entity.
  Mirrors the frontend join type.
"""

from dataclasses import dataclass

from src.domain.match.fixture import Fixture, FixtureStatus
from src.domain.match.fixture_repository import FixtureRepository
from src.domain.player.player import Player
from src.domain.player.player_repository import PlayerRepository
from src.domain.player.screener_criteria import ScreenerCriteria, SortDirection, SortKey
from src.domain.team.team import Team
from src.domain.team.team_repository import TeamRepository
from src.domain.valuation.player_valuation import PlayerValuation
from src.domain.valuation.valuation_provider import ValuationProvider


@dataclass(frozen=True, slots=True)
class PlayerWithValuation:
    player: Player
    valuation: PlayerValuation


# --- teams ----------------------------------------------------------------


async def list_teams(team_repo: TeamRepository) -> list[Team]:
    return await team_repo.list_all()


async def get_team(team_repo: TeamRepository, team_id: str) -> Team | None:
    return await team_repo.get_by_id(team_id)


# --- players --------------------------------------------------------------


async def list_players(player_repo: PlayerRepository) -> list[Player]:
    return await player_repo.list_all()


async def get_player(player_repo: PlayerRepository, player_id: int) -> Player | None:
    return await player_repo.get_by_id(player_id)


def _sort_pairs_by_valuation(
    pairs: list[PlayerWithValuation],
    *,
    key: SortKey,
    direction: SortDirection,
) -> list[PlayerWithValuation]:
    """Pure helper: sort by a valuation-derived key (value/change/rating).

    Age sort is handled at the SQL layer (see player repository) so it stays
    out of this function.
    """
    descending = direction is SortDirection.DESC
    if key is SortKey.VALUE:
        return sorted(pairs, key=lambda p: p.valuation.current_price, reverse=descending)
    if key is SortKey.CHANGE:
        return sorted(pairs, key=lambda p: p.valuation.change_24h, reverse=descending)
    if key is SortKey.RATING:
        return sorted(pairs, key=lambda p: p.valuation.performance_rating, reverse=descending)
    return pairs


async def search_players_with_valuation(
    *,
    player_repo: PlayerRepository,
    valuation_provider: ValuationProvider,
    criteria: ScreenerCriteria,
) -> list[PlayerWithValuation]:
    players = await player_repo.search(criteria)
    valuations = await valuation_provider.get_for_players([p.id for p in players])
    pairs = [PlayerWithValuation(player=p, valuation=valuations[p.id]) for p in players]

    if criteria.min_value is not None:
        pairs = [pwv for pwv in pairs if pwv.valuation.current_price >= criteria.min_value]
    if criteria.max_value is not None:
        pairs = [pwv for pwv in pairs if pwv.valuation.current_price <= criteria.max_value]

    if criteria.sort and criteria.sort.key is not SortKey.AGE:
        pairs = _sort_pairs_by_valuation(pairs, key=criteria.sort.key, direction=criteria.sort.direction)

    return pairs


# --- fixtures -------------------------------------------------------------


async def list_fixtures(fixture_repo: FixtureRepository) -> list[Fixture]:
    return await fixture_repo.list_all()


async def get_fixture(fixture_repo: FixtureRepository, fixture_id: int) -> Fixture | None:
    return await fixture_repo.get_by_id(fixture_id)


async def get_live_fixture(fixture_repo: FixtureRepository) -> Fixture | None:
    live = await fixture_repo.list_by_status(FixtureStatus.LIVE)
    return live[0] if live else None


# --- valuation queries ----------------------------------------------------


async def get_valuation_for_player(
    *,
    valuation_provider: ValuationProvider,
    player_id: int,
) -> PlayerValuation:
    return await valuation_provider.get_for_player(player_id)


async def list_top_movers(
    *,
    player_repo: PlayerRepository,
    valuation_provider: ValuationProvider,
    direction: SortDirection,
    limit: int,
) -> list[PlayerWithValuation]:
    """Top players sorted by `change_24h`. Direction DESC = best gainers,
    ASC = worst losers. Walks the whole player list (cheap with synthetic
    valuations; M5 will swap to a precomputed snapshot for efficiency)."""
    players = await player_repo.list_all()
    valuations = await valuation_provider.get_for_players([p.id for p in players])
    pairs = [PlayerWithValuation(player=p, valuation=valuations[p.id]) for p in players]
    pairs = _sort_pairs_by_valuation(pairs, key=SortKey.CHANGE, direction=direction)
    return pairs[:limit]
