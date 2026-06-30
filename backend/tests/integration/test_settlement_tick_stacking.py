"""Settlement-pass ticks must STACK, not get swallowed.

Regression for the latent bug behind ``_run_settlement``: settlement, suspension
and did-not-play all wrote at the SAME ``ts``, but the price-tick PK is
``(player_id, ts)`` with ``on_conflict_do_nothing`` — so a suspension tick at the
settlement's ts collided and was silently dropped. A player on a settled team
never got his suspension / did-not-play.

The fix staggers the events by 1ms each. This proves the underlying mechanism on
the real DB: (1) same ts → the second write is swallowed; (2) staggered ts → both
ticks persist AND the second compounds on the first (the reader returns the
latest tick by ts, so each event applies multiplicatively on top of the prior).

Isolation: rollback at teardown; zero DB pollution.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.valuation.last_tick_provider import last_price_and_rating

# ``isolated_session`` fixture is shared via tests/integration/conftest.py.


async def _a_player_id(session: AsyncSession) -> int:
    row = (await session.execute(text("SELECT id FROM core.player ORDER BY id LIMIT 1"))).first()
    if row is None:  # pragma: no cover — bootstrap populates players
        pytest.skip("need >= 1 player in core.player")
    return int(row[0])


async def _ticks_at(session: AsyncSession, player_id: int, *, since: datetime) -> list[tuple[datetime, float, str]]:
    rows = (
        await session.execute(
            text(
                "SELECT ts, current_price, source FROM valuation.player_price_tick "
                "WHERE player_id = :p AND ts >= :since ORDER BY ts"
            ),
            {"p": player_id, "since": since},
        )
    ).all()
    return [(r[0], float(r[1]), r[2]) for r in rows]


@pytest.mark.anyio
async def test_same_ts_swallows_second_event(isolated_session: AsyncSession) -> None:
    """Two settlement-pass events at the SAME ts → the second is dropped (the bug
    the fix avoids by staggering)."""
    player_id = await _a_player_id(isolated_session)
    ts = datetime.now(UTC) + timedelta(days=3650)  # far future → no collision with seeded ticks

    await upsert_price_tick(
        isolated_session, player_id=player_id, ts=ts, fixture_id=None,
        current_price=100.0, performance_rating=7.0, source="settlement",
    )
    # Suspension at the SAME ts: on_conflict_do_nothing → swallowed.
    await upsert_price_tick(
        isolated_session, player_id=player_id, ts=ts, fixture_id=None,
        current_price=90.0, performance_rating=7.0, source="suspension",
    )

    ticks = await _ticks_at(isolated_session, player_id, since=ts)
    assert len(ticks) == 1
    assert ticks[0][1] == pytest.approx(100.0)
    assert ticks[0][2] == "settlement"  # the first writer won


@pytest.mark.anyio
async def test_staggered_ts_stacks_and_compounds(isolated_session: AsyncSession) -> None:
    """Staggered ts → both ticks persist, and the suspension compounds on the
    settled price (the reader returns the latest tick by ts)."""
    player_id = await _a_player_id(isolated_session)
    ts = datetime.now(UTC) + timedelta(days=3650)

    # Settlement tick.
    await upsert_price_tick(
        isolated_session, player_id=player_id, ts=ts, fixture_id=None,
        current_price=100.0, performance_rating=7.0, source="settlement",
    )
    # Suspension reads the latest price (the settlement tick) and applies -10% on
    # top, written 1ms later so it does not collide.
    last_price, _ = await last_price_and_rating(isolated_session, [player_id])
    suspended_price = round(last_price[player_id] * 0.90, 2)
    await upsert_price_tick(
        isolated_session, player_id=player_id, ts=ts + timedelta(milliseconds=1), fixture_id=None,
        current_price=suspended_price, performance_rating=7.0, source="suspension",
    )

    ticks = await _ticks_at(isolated_session, player_id, since=ts)
    assert len(ticks) == 2
    assert [t[2] for t in ticks] == ["settlement", "suspension"]
    assert ticks[0][1] == pytest.approx(100.0)
    assert ticks[1][1] == pytest.approx(90.0)  # compounded: 100 * 0.90
    # The current price (latest tick) reflects BOTH events.
    final_price, _ = await last_price_and_rating(isolated_session, [player_id])
    assert final_price[player_id] == pytest.approx(90.0)
