"""EngineValuationProvider — reads valuation.player_price_tick for live prices.

DDD role: Adapter implementing ValuationProvider. Drop-in replacement for
SyntheticValuationProvider. Falls back to the synthetic seed for a player
with no tick yet (e.g. before any replay run).

Three change metrics, all in percent:
- ``change_since_inception``: (current_price / base_value - 1) * 100 — the
  canonical "% change" used by screeners / top-movers.
- ``change_avg_per_match``: mean, over each fixture the player was priced in,
  of that fixture's net change, derived from pre/post PRICES (not stored
  deltas). None when the player has no fixtured tick.
- ``change_last_match``: the most recent fixture's net change, same basis.

Batched by design: ``get_for_players`` resolves any number of players in a
fixed THREE queries (latest tick, anchor, fixtured-tick prices) — never one
query per player. A 26-player squad costs 3 round-trips, not ~90.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.player_valuation import PlayerValuation, ValuationSource
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation

# Neutral rating for an un-ticked player (no performance signal yet).
_NEUTRAL_RATING = 6.5


def per_match_changes_from_prices(
    rows: list[tuple[int, int, float]],
    *,
    base_by_player: dict[int, float],
) -> dict[int, tuple[float, float]]:
    """Per player, the ``(avg, last)`` NET price move across the fixtures it was
    priced in — computed from PRICES, not from any stored per-tick delta.

    ``rows`` is ``(player_id, fixture_id, current_price)`` for the player's
    FIXTURED ticks, ordered by ``player_id, ts ASC``. A fixture's net move is
    ``last_price / pre_price - 1``, where ``pre_price`` is the player's price
    right before that fixture's first tick: the previous fixture's close, or —
    for the first fixture — the tournament-open price in ``base_by_player``.

    This is independent of how per-tick deltas are stored (it only reads
    prices), so it is the single, semantic-proof definition of "match %" — the
    same one the per-match list endpoint derives from pre/post prices. The last
    fixture in ts order is the most recent match. Players with no fixtured tick
    are absent (caller maps to None).
    """
    pre: dict[int, dict[int, float]] = {}
    post: dict[int, dict[int, float]] = {}
    order: dict[int, list[int]] = {}
    carried: dict[int, float] = dict(base_by_player)  # first fixture's pre = tournament-open
    for player_id, fixture_id, price in rows:
        player_pre = pre.setdefault(player_id, {})
        if fixture_id not in player_pre:
            player_pre[fixture_id] = carried.get(player_id, price)
            order.setdefault(player_id, []).append(fixture_id)
        post.setdefault(player_id, {})[fixture_id] = price
        carried[player_id] = price  # this fixture's running close → next fixture's pre

    out: dict[int, tuple[float, float]] = {}
    for player_id, fixtures in order.items():
        nets = [
            round((post[player_id][fid] / pre[player_id][fid] - 1.0) * 100.0, 2)
            for fid in fixtures
            if pre[player_id][fid] > 0
        ]
        if nets:
            out[player_id] = (round(sum(nets) / len(nets), 2), nets[-1])
    return out


class EngineValuationProvider:
    """Reads `valuation.player_price_tick` for the latest price per player."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_for_player(self, player_id: int) -> PlayerValuation:
        valuations = await self.get_for_players([player_id])
        return valuations[player_id]

    async def get_for_players(self, player_ids: list[int]) -> dict[int, PlayerValuation]:
        if not player_ids:
            return {}
        # De-duplicate while preserving order — callers may pass repeats.
        ids = list(dict.fromkeys(player_ids))

        # Query 1 — latest tick per player (current price, rating, ts).
        latest_rows = (
            await self._session.execute(
                select(
                    PlayerPriceTickORM.player_id,
                    PlayerPriceTickORM.current_price,
                    PlayerPriceTickORM.performance_rating,
                    PlayerPriceTickORM.ts,
                )
                .distinct(PlayerPriceTickORM.player_id)
                .where(PlayerPriceTickORM.player_id.in_(ids))
                .order_by(PlayerPriceTickORM.player_id, PlayerPriceTickORM.ts.desc())
            )
        ).all()
        latest = {row.player_id: row for row in latest_rows}

        # Query 2 — the tournament-open anchor per player: the pre-match
        # baseline tick (fixture_id IS NULL) if present, else the earliest
        # tick overall. Same ordering the screener-view anchor CTE uses.
        anchor_rows = (
            await self._session.execute(
                select(PlayerPriceTickORM.player_id, PlayerPriceTickORM.current_price)
                .distinct(PlayerPriceTickORM.player_id)
                .where(PlayerPriceTickORM.player_id.in_(ids))
                .order_by(
                    PlayerPriceTickORM.player_id,
                    PlayerPriceTickORM.fixture_id.isnot(None).asc(),
                    PlayerPriceTickORM.ts.asc(),
                )
            )
        ).all()
        anchor = {row.player_id: float(row.current_price) for row in anchor_rows}

        # Query 3 — every fixtured tick's PRICE, to derive each fixture's net
        # move from pre/post prices (semantic-proof; no stored-delta dependency).
        match_rows = (
            await self._session.execute(
                select(
                    PlayerPriceTickORM.player_id,
                    PlayerPriceTickORM.fixture_id,
                    PlayerPriceTickORM.current_price,
                )
                .where(
                    PlayerPriceTickORM.player_id.in_(ids),
                    PlayerPriceTickORM.fixture_id.isnot(None),
                )
                .order_by(PlayerPriceTickORM.player_id, PlayerPriceTickORM.ts.asc())
            )
        ).all()
        per_match = per_match_changes_from_prices(
            [(row.player_id, row.fixture_id, float(row.current_price)) for row in match_rows],
            base_by_player=anchor,
        )

        now = datetime.now(UTC)
        result: dict[int, PlayerValuation] = {}
        for player_id in ids:
            tick = latest.get(player_id)
            if tick is None:
                # No tick yet: a player's starting price IS its deterministic
                # base value (the same price place_trade charges) — flat, not
                # the random synthetic walk, so no invented movement leaks in.
                # since_start = 0% (price == base); no match yet → None.
                base = synthesize_valuation(player_id, as_of=now).base_value
                result[player_id] = PlayerValuation(
                    player_id=player_id,
                    base_value=base,
                    current_price=base,
                    change_since_inception=0.0,
                    change_avg_per_match=None,
                    change_last_match=None,
                    performance_rating=_NEUTRAL_RATING,
                    as_of=now,
                    source=ValuationSource.SYNTHETIC,
                )
                continue
            current_price = float(tick.current_price)
            base_value = anchor.get(player_id, current_price)
            change_since_inception = (
                round((current_price / base_value - 1.0) * 100.0, 2) if base_value > 0 else 0.0
            )
            # None (not 0.0) when the player has no fixture ticks: "no match
            # yet" is n/a, not a flat 0% match.
            change_avg_per_match, change_last_match = per_match.get(player_id, (None, None))
            result[player_id] = PlayerValuation(
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
        return result
