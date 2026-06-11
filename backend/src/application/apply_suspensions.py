"""ApplySuspensions — penalise players banned for their next match (-15%).

DDD role: Application Service. Runs at a fixture's full-time, alongside
``settle_fixture``: a sending-off (straight red or second yellow) or a yellow
that completes a two-card accumulation means the player misses the next match,
so his price takes a one-off -15%. The discipline rule itself is the pure
``valuation.tournament.newly_suspended_players``; this module gathers the card
data and writes the ticks.

The tick attaches to the triggering fixture (``source='suspension'``) — keeping
the tournament-open anchor intact and folding the drop into that match. Idempotent:
a second call for the same fixture is a no-op.
"""

import json
from datetime import datetime

import structlog
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.match_event import MatchEventType
from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.models.match_event import MatchEventORM
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.valuation.db_starting_price_provider import DbStartingPriceProvider
from src.infrastructure.valuation.last_tick_provider import last_price_and_rating
from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients
from src.valuation.tournament import newly_suspended_players, plan_flat_impact

log = structlog.get_logger(__name__)

_SUSPENSION_SOURCE = ValuationSource.SUSPENSION.value
_CARD_TYPES = (
    MatchEventType.YELLOW_CARD.value,
    MatchEventType.RED_CARD.value,
    MatchEventType.YELLOW_RED_CARD.value,
)


async def _already_processed(session: AsyncSession, fixture_id: int) -> bool:
    row = await session.execute(
        text(
            "SELECT 1 FROM valuation.player_price_tick "
            "WHERE fixture_id = :fx AND source = :src LIMIT 1"
        ),
        {"fx": fixture_id, "src": _SUSPENSION_SOURCE},
    )
    return row.scalar_one_or_none() is not None


async def _cards_in_fixture(session: AsyncSession, fixture_id: int) -> list[tuple[int, str]]:
    rows = (
        await session.execute(
            select(MatchEventORM.player_id, MatchEventORM.type).where(
                MatchEventORM.fixture_id == fixture_id,
                MatchEventORM.type.in_(_CARD_TYPES),
                MatchEventORM.player_id.isnot(None),
            )
        )
    ).all()
    return [(r.player_id, r.type) for r in rows]


async def _cumulative_yellows(session: AsyncSession, player_ids: list[int]) -> dict[int, int]:
    """Each player's total ``yellow_card`` count across the whole tournament so
    far (the events table only holds matches already played)."""
    if not player_ids:
        return {}
    rows = (
        await session.execute(
            select(MatchEventORM.player_id, func.count())
            .where(
                MatchEventORM.type == MatchEventType.YELLOW_CARD.value,
                MatchEventORM.player_id.in_(player_ids),
            )
            .group_by(MatchEventORM.player_id)
        )
    ).all()
    return {r.player_id: int(r[1]) for r in rows}


async def apply_suspensions(
    session: AsyncSession,
    *,
    fixture_id: int,
    ts: datetime,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[tuple[str, bytes]]:
    """Apply -15% to every player newly suspended by this fixture. Returns
    per-player ``player_price_tick`` notifications; empty when nobody is banned."""
    if await _already_processed(session, fixture_id):
        return []
    cards = await _cards_in_fixture(session, fixture_id)
    if not cards:
        return []
    carded_ids = list({player_id for player_id, _ in cards})
    cumulative = await _cumulative_yellows(session, carded_ids)
    suspended = newly_suspended_players(cards_in_fixture=cards, cumulative_yellows=cumulative)
    if not suspended:
        return []

    suspended_ids = list(suspended)
    base_by_player = await DbStartingPriceProvider(session).get_many(suspended_ids)
    last_price_by_player, rating_by_player = await last_price_and_rating(session, suspended_ids)
    ticks = plan_flat_impact(
        player_ids=suspended_ids,
        base_by_player=base_by_player,
        last_price_by_player=last_price_by_player,
        rating_by_player=rating_by_player,
        impact_frac=coefficients.w_suspension_frac,
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
            source=_SUSPENSION_SOURCE,
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
        "valuation.suspension.done",
        fixture_id=fixture_id,
        suspended_players=len(notifications),
    )
    return notifications
