"""EngineValuationProvider — reads valuation.player_price_tick for live prices.

DDD role: Adapter implementing ValuationProvider. Drop-in replacement for
SyntheticValuationProvider. Falls back to the synthetic seed for a player
with no tick yet (e.g. before any replay run).

Three change metrics, all in percent:
- ``change_since_inception``: (current_price / base_value - 1) * 100 — the
  canonical "% change" used by screeners / top-movers.
- ``change_avg_per_match``: mean, over each fixture the player has ticks in,
  of that fixture's net change (its latest tick's ``change_since_open``).
- ``change_last_match``: the latest tick's ``change_since_open`` — moves live
  during a match, then holds until the next match's first tick.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.player_valuation import PlayerValuation, ValuationSource
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation


class EngineValuationProvider:
    """Reads `valuation.player_price_tick` for the latest price per player."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def _latest_tick(self, player_id: int) -> PlayerPriceTickORM | None:
        result = await self._session.execute(
            select(PlayerPriceTickORM)
            .where(PlayerPriceTickORM.player_id == player_id)
            .order_by(PlayerPriceTickORM.ts.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _base_anchor_price(self, player_id: int) -> float | None:
        """The tournament-open anchor for ``change_since_inception``.

        The replay/live engines seed every player with a baseline tick
        BEFORE any match (``fixture_id IS NULL``) at their pre-tournament
        value. That is the correct anchor — it has not absorbed any event
        jump. Prefer it; only if no such baseline exists (legacy data)
        fall back to the earliest tick overall.
        """
        baseline = await self._session.execute(
            select(PlayerPriceTickORM.current_price)
            .where(
                PlayerPriceTickORM.player_id == player_id,
                PlayerPriceTickORM.fixture_id.is_(None),
            )
            .order_by(PlayerPriceTickORM.ts.asc())
            .limit(1)
        )
        price = baseline.scalar_one_or_none()
        if price is not None:
            return float(price)
        earliest = await self._session.execute(
            select(PlayerPriceTickORM.current_price)
            .where(PlayerPriceTickORM.player_id == player_id)
            .order_by(PlayerPriceTickORM.ts.asc())
            .limit(1)
        )
        price = earliest.scalar_one_or_none()
        return float(price) if price is not None else None

    async def _per_match_changes(self, player_id: int) -> tuple[float, float]:
        """Return (avg_per_match, last_match) as NET price moves per fixture.

        A tick's ``change_since_open`` is the delta of THAT single event,
        not a running total. A fixture's real net change is therefore the
        COMPOUND of all its ticks (product of (1 + d/100), minus 1), i.e.
        its price at the last tick vs. the price it opened the match at
        -- NOT the last tick's lone delta. Using the last tick made every
        player of a team look red whenever the match's final event was a
        goal conceded, even in a match they won.

        Ticks for a player are chronological and a fixture's ticks form a
        contiguous time block, so the last fixture seen (ts asc) is the
        most recent match.
        """
        rows = (
            await self._session.execute(
                select(PlayerPriceTickORM.fixture_id, PlayerPriceTickORM.change_since_open)
                .where(PlayerPriceTickORM.player_id == player_id, PlayerPriceTickORM.fixture_id.is_not(None))
                .order_by(PlayerPriceTickORM.ts.asc())
            )
        ).all()
        factor_by_fixture: dict[int, float] = {}
        order: list[int] = []
        for fixture_id, change in rows:
            if fixture_id is None:
                continue
            if fixture_id not in factor_by_fixture:
                factor_by_fixture[fixture_id] = 1.0
                order.append(fixture_id)
            factor_by_fixture[fixture_id] *= 1.0 + float(change) / 100.0
        if not order:
            return 0.0, 0.0
        net_by_fixture = {fid: (f - 1.0) * 100.0 for fid, f in factor_by_fixture.items()}
        avg = round(sum(net_by_fixture.values()) / len(net_by_fixture), 2)
        last = round(net_by_fixture[order[-1]], 2)
        return avg, last

    async def get_for_player(self, player_id: int) -> PlayerValuation:
        tick = await self._latest_tick(player_id)
        if tick is None:
            # No tick yet → fall back to deterministic synthetic seed.
            return synthesize_valuation(player_id, as_of=datetime.now(UTC))

        anchor_price = await self._base_anchor_price(player_id)
        base_value = anchor_price if anchor_price is not None else float(tick.current_price)
        current_price = float(tick.current_price)
        change_since_inception = round((current_price / base_value - 1.0) * 100.0, 2) if base_value > 0 else 0.0
        change_avg_per_match, change_last_match = await self._per_match_changes(player_id)

        return PlayerValuation(
            player_id=player_id,
            base_value=base_value,
            current_price=current_price,
            change_since_inception=change_since_inception,
            change_avg_per_match=change_avg_per_match,
            change_last_match=change_last_match,
            performance_rating=float(tick.performance_rating),
            as_of=tick.ts,
            source=ValuationSource.ENGINE,
        )

    async def get_for_players(self, player_ids: list[int]) -> dict[int, PlayerValuation]:
        if not player_ids:
            return {}
        # Python sequential loop for simplicity; players with no tick short-
        # circuit to the synthetic seed (no extra queries).
        result: dict[int, PlayerValuation] = {}
        for pid in player_ids:
            result[pid] = await self.get_for_player(pid)
        return result
