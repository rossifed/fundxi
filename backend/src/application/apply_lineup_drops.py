"""ApplyLineupDrops — penalise an expected starter who is benched (-2%).

DDD role: Application Service. Runs when a fixture's starting XI is published
(~1h before kickoff, every poll until applied): a player who started his team's
PREVIOUS match but is no longer in the XI has been dropped, which is a real
pre-match catalyst worth a one-off -2%. The "who is dropped" rule is the pure
``valuation.tournament.dropped_starters``; this module gathers the two lineups.

Only fires once BOTH teams have published a full XI (>=11 starters each), so a
partially-ingested lineup never triggers a premature drop. Idempotent on the
``lineup_drop`` tick source; the tick attaches to this fixture (anchor-safe).
"""

import json
from datetime import datetime

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.lineup import LineupRole
from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.lineup import SqlAlchemyLineupRepository
from src.infrastructure.valuation.db_starting_price_provider import DbStartingPriceProvider
from src.infrastructure.valuation.last_tick_provider import last_price_and_rating
from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients
from src.valuation.tournament import dropped_starters, plan_flat_impact

log = structlog.get_logger(__name__)

_LINEUP_DROP_SOURCE = ValuationSource.LINEUP_DROP.value
_MIN_STARTERS = 11


async def _already_processed(session: AsyncSession, fixture_id: int) -> bool:
    row = await session.execute(
        text(
            "SELECT 1 FROM valuation.player_price_tick "
            "WHERE fixture_id = :fx AND source = :src LIMIT 1"
        ),
        {"fx": fixture_id, "src": _LINEUP_DROP_SOURCE},
    )
    return row.scalar_one_or_none() is not None


async def _previous_fixture_starters(
    session: AsyncSession, *, team_id: str, before_kickoff: datetime
) -> set[int]:
    """Starters of the team's most recent FINISHED fixture before this one.
    Empty when the team has no earlier match (tournament opener)."""
    row = await session.execute(
        text(
            """
            SELECT l.player_id
            FROM core.lineup l
            WHERE l.team_id = :team AND l.role = 'starter'
              AND l.fixture_id = (
                SELECT f.id FROM core.fixture f
                WHERE f.status = 'finished'
                  AND (f.home_team_id = :team OR f.away_team_id = :team)
                  AND f.kickoff_at < :cutoff
                ORDER BY f.kickoff_at DESC
                LIMIT 1
              )
            """
        ),
        {"team": team_id, "cutoff": before_kickoff},
    )
    return {r.player_id for r in row.all()}


async def apply_lineup_drops(
    session: AsyncSession,
    *,
    fixture_id: int,
    ts: datetime,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[tuple[str, bytes]]:
    """Apply -2% to every dropped expected-starter in this fixture. Returns
    per-player notifications; empty until both XIs are published, or when nobody
    was dropped."""
    if await _already_processed(session, fixture_id):
        return []
    fixture = await SqlAlchemyFixtureRepository(session).get_by_id(fixture_id)
    if fixture is None or fixture.kickoff_at is None:
        return []

    lineups = await SqlAlchemyLineupRepository(session).list_by_fixture(fixture_id)
    starters_by_team: dict[str, set[int]] = {fixture.home_team_id: set(), fixture.away_team_id: set()}
    for entry in lineups:
        if entry.role is LineupRole.STARTER and entry.team_id in starters_by_team:
            starters_by_team[entry.team_id].add(entry.player_id)
    # Wait for a complete XI on both sides before judging who was dropped.
    if any(len(starters) < _MIN_STARTERS for starters in starters_by_team.values()):
        return []

    dropped: set[int] = set()
    for team_id, current_starters in starters_by_team.items():
        previous = await _previous_fixture_starters(
            session, team_id=team_id, before_kickoff=fixture.kickoff_at
        )
        dropped |= dropped_starters(previous_starters=previous, current_starters=current_starters)
    if not dropped:
        return []

    dropped_ids = list(dropped)
    base_by_player = await DbStartingPriceProvider(session).get_many(dropped_ids)
    last_price_by_player, rating_by_player = await last_price_and_rating(session, dropped_ids)
    ticks = plan_flat_impact(
        player_ids=dropped_ids,
        base_by_player=base_by_player,
        last_price_by_player=last_price_by_player,
        rating_by_player=rating_by_player,
        impact_frac=coefficients.w_out_of_xi_frac,
        coefficients=coefficients,
    )

    notifications: list[tuple[str, bytes]] = []
    for tick in ticks:
        await upsert_price_tick(
            session,
            player_id=tick.player_id,
            ts=ts,
            fixture_id=fixture_id,
            current_price=tick.price,
            performance_rating=tick.rating,
            source=_LINEUP_DROP_SOURCE,
        )
        notifications.append(
            (
                f"fundxi.player_price_tick.{tick.player_id}",
                json.dumps(
                    {
                        "kind": "player_price_tick",
                        "player_id": tick.player_id,
                        "fixture_id": fixture_id,
                        "current_price": tick.price,
                    }
                ).encode(),
            )
        )

    log.info(
        "valuation.lineup_drop.done",
        fixture_id=fixture_id,
        dropped_players=len(notifications),
    )
    return notifications
