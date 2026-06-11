"""ApplyDidNotPlay — penalise a squad player who got 0 minutes (-1% x tally).

DDD role: Application Service. Runs at a fixture's full-time alongside the other
settlement events. A player who was in the matchday squad (has a lineup row) but
did NOT feature (no per-match stat row → 0 minutes) loses value, scaled by how
many zero-minute matches he has racked up this tournament: ``-1% x N``. So a
benchwarmer rots faster the longer he sits (match 1 missed -1%, match 2 -2%, …),
while a player who gets ANY minutes is never touched.

Reliable by construction: Sportmonks omits the per-match stat row for a bench
player who never comes on, so "0 minutes" = "in the lineup, no stat row" — no
dependence on the flaky substitution in/out feed. Idempotent on the
``did_not_play`` tick source; the tick attaches to the fixture (anchor-safe).
"""

import json
from datetime import datetime

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.valuation.db_starting_price_provider import DbStartingPriceProvider
from src.infrastructure.valuation.last_tick_provider import last_price_and_rating
from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients
from src.valuation.tournament import plan_impacts

log = structlog.get_logger(__name__)

_DID_NOT_PLAY_SOURCE = ValuationSource.DID_NOT_PLAY.value


async def _already_processed(session: AsyncSession, fixture_id: int) -> bool:
    row = await session.execute(
        text(
            "SELECT 1 FROM valuation.player_price_tick "
            "WHERE fixture_id = :fx AND source = :src LIMIT 1"
        ),
        {"fx": fixture_id, "src": _DID_NOT_PLAY_SOURCE},
    )
    return row.scalar_one_or_none() is not None


async def _did_not_play_in_fixture(session: AsyncSession, fixture_id: int) -> list[int]:
    """Squad players (in the lineup) with NO stat row for this fixture → 0 minutes."""
    rows = await session.execute(
        text(
            """
            SELECT l.player_id
            FROM core.lineup l
            LEFT JOIN core.player_match_stat s
              ON s.fixture_id = l.fixture_id AND s.player_id = l.player_id
            WHERE l.fixture_id = :fx AND s.id IS NULL
            """
        ),
        {"fx": fixture_id},
    )
    return [r.player_id for r in rows.all()]


async def _zero_minute_tally(session: AsyncSession, player_ids: list[int]) -> dict[int, int]:
    """Per player, the count of FINISHED fixtures he was in the squad for but did
    not feature (lineup row, no stat row). Includes the fixture being settled,
    since it is already 'finished' and carries no stat row for these players."""
    if not player_ids:
        return {}
    rows = await session.execute(
        text(
            """
            SELECT l.player_id, COUNT(DISTINCT l.fixture_id) AS tally
            FROM core.lineup l
            JOIN core.fixture f ON f.id = l.fixture_id AND f.status = 'finished'
            LEFT JOIN core.player_match_stat s
              ON s.fixture_id = l.fixture_id AND s.player_id = l.player_id
            WHERE l.player_id = ANY(:players) AND s.id IS NULL
            GROUP BY l.player_id
            """
        ),
        {"players": player_ids},
    )
    return {r.player_id: int(r.tally) for r in rows.all()}


async def apply_did_not_play(
    session: AsyncSession,
    *,
    fixture_id: int,
    ts: datetime,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[tuple[str, bytes]]:
    """Apply ``-1% x zero-minute-tally`` to every squad player who got 0 minutes
    in this fixture. Returns per-player notifications; empty when everyone in the
    squad featured."""
    if await _already_processed(session, fixture_id):
        return []
    player_ids = await _did_not_play_in_fixture(session, fixture_id)
    if not player_ids:
        return []

    tally = await _zero_minute_tally(session, player_ids)
    impacts_by_player = {
        pid: coefficients.w_did_not_play_frac * tally.get(pid, 1) for pid in player_ids
    }
    base_by_player = await DbStartingPriceProvider(session).get_many(player_ids)
    last_price_by_player, rating_by_player = await last_price_and_rating(session, player_ids)
    ticks = plan_impacts(
        impacts_by_player=impacts_by_player,
        base_by_player=base_by_player,
        last_price_by_player=last_price_by_player,
        rating_by_player=rating_by_player,
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
            source=_DID_NOT_PLAY_SOURCE,
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
        "valuation.did_not_play.done",
        fixture_id=fixture_id,
        penalised_players=len(notifications),
    )
    return notifications
