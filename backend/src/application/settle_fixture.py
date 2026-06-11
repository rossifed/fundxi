"""SettleFixtureUseCase — bank a finished fixture's result into player prices.

DDD role: Application Service. Triggered ONCE when a fixture reaches full-time.
The volatile in-match performance is already in each player's last live tick;
this step applies the COLLECTIVE result consequence (group win / knockout win /
knockout elimination) as one persistent settlement tick per player of BOTH
teams — including squad members who never came on (the whole team shares the
fate). The pricing decision lives in the pure ``valuation.tournament`` planner;
this module is the thin I/O around it (read fixture + roster + last prices,
write ticks, return notifications).

Idempotent: a second call is a no-op once a settlement tick exists for the
fixture (guarded both by an in-memory flag in the poller and by this DB check,
so a poller restart cannot double-apply a -40%).
"""

import json
from datetime import datetime

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.fixture import FixtureStatus
from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.valuation.db_starting_price_provider import DbStartingPriceProvider
from src.infrastructure.valuation.last_tick_provider import last_price_and_rating
from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients
from src.valuation.tournament import Side, decisive_winner, is_group_stage, plan_settlement

log = structlog.get_logger(__name__)

_SETTLEMENT_SOURCE = ValuationSource.SETTLEMENT.value


async def _already_settled(session: AsyncSession, fixture_id: int) -> bool:
    row = await session.execute(
        text(
            "SELECT 1 FROM valuation.player_price_tick "
            "WHERE fixture_id = :fx AND source = :src LIMIT 1"
        ),
        {"fx": fixture_id, "src": _SETTLEMENT_SOURCE},
    )
    return row.scalar_one_or_none() is not None


async def settle_fixture(
    session: AsyncSession,
    *,
    fixture_id: int,
    ts: datetime,
    winner_override: Side | None = None,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[tuple[str, bytes]]:
    """Settle a finished fixture. Returns per-player ``player_price_tick``
    notifications (subject, payload) for ``commit_then_publish`` — empty when
    there is nothing to settle (not finished, already settled, knockout winner
    undetermined, or no team earns a non-zero result impact)."""
    fixture = await SqlAlchemyFixtureRepository(session).get_by_id(fixture_id)
    if fixture is None or fixture.status is not FixtureStatus.FINISHED:
        return []
    if await _already_settled(session, fixture_id):
        return []

    is_group = is_group_stage(fixture.stage_name)
    winner = winner_override if winner_override is not None else decisive_winner(
        fixture.home_score, fixture.away_score
    )
    if winner is None and not is_group:
        # Knockout with no decisive score and no explicit shootout winner: we
        # cannot know who is eliminated. Skip the result event (never crash the
        # wrong team) — the live performance is already banked. Wiring the
        # penalty-shootout winner needs the real Sportmonks FT_PEN payload.
        log.warning(
            "valuation.settle.knockout_winner_undetermined",
            fixture_id=fixture_id,
            home_score=fixture.home_score,
            away_score=fixture.away_score,
            stage_name=fixture.stage_name,
        )
        return []

    roster_rows = (
        await session.execute(
            select(PlayerORM.id, PlayerORM.team_id).where(
                PlayerORM.team_id.in_([fixture.home_team_id, fixture.away_team_id])
            )
        )
    ).all()
    roster = [(r.id, r.team_id) for r in roster_rows]
    player_ids = [pid for pid, _ in roster]

    base_by_player = await DbStartingPriceProvider(session).get_many(player_ids)
    last_price_by_player, rating_by_player = await last_price_and_rating(session, player_ids)

    ticks = plan_settlement(
        home_team_id=fixture.home_team_id,
        away_team_id=fixture.away_team_id,
        is_group=is_group,
        winner=winner,
        roster=roster,
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
            source=_SETTLEMENT_SOURCE,
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
        "valuation.settle.done",
        fixture_id=fixture_id,
        is_group=is_group,
        winner=(winner.value if winner is not None else None),
        settled_players=len(ticks),
    )
    return notifications
