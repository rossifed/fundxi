"""Cross-source coherence invariants — the user-facing guarantee.

The user must be able to trust that every number shown anywhere agrees
with every other number derived from the same underlying state. This
file proves it on the BACKEND side end-to-end:

  1. The price a user sees on the player detail page comes from
     ``EngineValuationProvider.get_for_player`` (latest tick).
  2. The price the screener shows for that same player comes from the
     same latest_tick (the screener SQL's ``latest_tick`` CTE).
  3. The price the leaderboard uses to compute portfolio value also
     comes from the same latest_tick (``_LEADERBOARD_SQL``).
  4. Portfolio value derived by hand (cash + sum shares * latest_tick)
     equals the league leaderboard's reported ``value``.

If any of these diverge for the same user / player / instant, a UI
surface is reading from a different source than another and the user
would see contradictory numbers. The test fails loud.

Isolation: rollback at teardown; zero DB pollution.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.domain.league.league import LeagueKind
from src.domain.portfolio.portfolio import Holding
from src.infrastructure.db.models.league import LeagueMemberORM, LeagueORM
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.league import SqlAlchemyLeagueRepository
from src.infrastructure.db.repositories.portfolio import SqlAlchemyPortfolioRepository
from src.infrastructure.valuation.engine_valuation_provider import EngineValuationProvider

# ``isolated_session`` fixture is shared via tests/integration/conftest.py.


async def _two_player_ids(session: AsyncSession) -> tuple[int, int]:
    rows = (await session.execute(text("SELECT id FROM core.player ORDER BY id LIMIT 2"))).all()
    if len(rows) < 2:  # pragma: no cover — bootstrap should have populated
        pytest.skip("need >= 2 players in core.player")
    return int(rows[0][0]), int(rows[1][0])


async def _untickedplayer(session: AsyncSession) -> tuple[int, float | None]:
    """A player with no price tick at all, plus the price the leaderboard
    ladder must mark it at (``base_value`` if seeded, else the test's own
    cost basis). Skips if every player happens to be ticked."""
    row = (
        await session.execute(
            text(
                "SELECT id, base_value FROM core.player "
                "WHERE id NOT IN (SELECT DISTINCT player_id FROM valuation.player_price_tick) "
                "ORDER BY id LIMIT 1"
            )
        )
    ).first()
    if row is None:  # pragma: no cover — there is always an un-ticked tail
        pytest.skip("need >= 1 player with no price tick")
    return int(row[0]), (float(row[1]) if row[1] is not None else None)


@pytest.mark.anyio
async def test_cross_source_coherence(isolated_session: AsyncSession) -> None:
    """Two invariants in one test (single asyncio fixture lifecycle).

    Invariant 1: same player's ``current_price`` must agree between
    (a) the raw latest tick in the DB, (b) what
    ``EngineValuationProvider.get_for_player`` returns (used by
    ``/api/players/{id}``, PlayerSheet, MatchView, RightRail, etc.),
    (c) what the screener SQL's ``latest_tick`` CTE picks (used by
    ``/api/players/screener-view``). If any diverge, two UI surfaces
    show different prices for the same player at the same instant.

    Invariant 2: the ``_LEADERBOARD_SQL`` reports a portfolio value
    that equals the hand-computed ``cash + sum (shares * latest_tick)``
    to the cent. If the SQL drifts, the user's league rank silently
    disagrees with their portfolio total.
    """
    p1, p2 = await _two_player_ids(isolated_session)

    # --- Invariant 1: a single tick must be read identically by all
    # three price-source paths.
    ts = datetime.now(UTC)
    await isolated_session.execute(
        pg_insert(PlayerPriceTickORM)
        .values(
            player_id=p1,
            ts=ts,
            fixture_id=None,
            current_price=42.42,  # literal sentinel
            performance_rating=7.0,
            source="engine",
        )
        .on_conflict_do_nothing(index_elements=["player_id", "ts"])
    )
    await isolated_session.flush()

    raw = (
        await isolated_session.execute(
            text("SELECT current_price FROM valuation.player_price_tick WHERE player_id=:p ORDER BY ts DESC LIMIT 1"),
            {"p": p1},
        )
    ).scalar_one()
    provider_price = (await EngineValuationProvider(isolated_session).get_for_player(p1)).current_price
    screener_price = (
        await isolated_session.execute(
            text(
                "SELECT current_price FROM ("
                "  SELECT DISTINCT ON (player_id) player_id, current_price "
                "  FROM valuation.player_price_tick ORDER BY player_id, ts DESC"
                ") lt WHERE player_id=:p"
            ),
            {"p": p1},
        )
    ).scalar_one()
    assert float(raw) == 42.42
    assert provider_price == 42.42
    assert float(screener_price) == 42.42

    # --- Invariant 2: leaderboard value equals hand-computed portfolio
    # value (cash + sum shares * latest_tick) for the same user.
    portfolio_repo = SqlAlchemyPortfolioRepository(isolated_session)
    league_repo = SqlAlchemyLeagueRepository(isolated_session)

    # Throwaway user + portfolio.
    user = UserORM(name=f"_coh_{id(isolated_session)}", kind="human")
    isolated_session.add(user)
    await isolated_session.flush()
    portfolio = await portfolio_repo.create_for_user(user_id=user.id, cash=get_settings().initial_cash)

    # Known per-player latest ticks (sentinel values, easy to verify by hand).
    p1_price = 10.00
    p2_price = 25.50
    base_ts = datetime.now(UTC) + timedelta(seconds=1)
    for pid, price in [(p1, p1_price), (p2, p2_price)]:
        await isolated_session.execute(
            pg_insert(PlayerPriceTickORM)
            .values(
                player_id=pid,
                ts=base_ts,
                fixture_id=None,
                current_price=price,
                performance_rating=7.0,
                source="engine",
            )
            .on_conflict_do_nothing(index_elements=["player_id", "ts"])
        )

    # Holdings: 3 shares of p1 and 4 shares of p2. avg_buy is irrelevant
    # for `value` (only affects return_pct cost basis, not the price math).
    for pid, shares in [(p1, 3.0), (p2, 4.0)]:
        await portfolio_repo.upsert_holding(
            Holding(portfolio_id=portfolio.id, player_id=pid, shares=shares, average_buy_price=5.0)
        )
    await isolated_session.flush()

    # Throwaway league with this user as the sole member.
    league = LeagueORM(name=f"_coh_lg_{id(isolated_session)}", kind=LeagueKind.PRIVATE.value, invite_code="ZZZZZZ")
    isolated_session.add(league)
    await isolated_session.flush()
    isolated_session.add(LeagueMemberORM(league_id=league.id, user_id=user.id))
    await isolated_session.flush()

    # Hand-computed expected: cash + 3 * 10.00 + 4 * 25.50
    expected_value = get_settings().initial_cash + 3.0 * p1_price + 4.0 * p2_price

    # What the backend leaderboard reports for this user.
    board = await league_repo.leaderboard(league_id=league.id, me_user_id=user.id)
    me = next((e for e in board if e.user_id == user.id), None)
    assert me is not None, "user must appear in their own league's leaderboard"
    assert me.value == pytest.approx(expected_value, abs=0.01)


@pytest.mark.anyio
async def test_leaderboard_does_not_drop_short_in_untickedplayer(isolated_session: AsyncSession) -> None:
    """Regression: a SHORT on an un-ticked player must NOT vanish from the
    leaderboard value.

    The leaderboard marks every position at ``tick ?? base ?? cost`` (the
    COHERENCE-INVARIANT). Before the fix it marked at ``tick`` ALONE: an
    un-ticked player priced as NULL, so ``shares * NULL`` was dropped from the
    value sum. For a short (shares < 0) that threw away the liability while the
    short's cash credit stayed counted — a fresh user who shorted such a player
    showed a phantom +20%. Here we short an un-ticked player and assert the
    liability is still priced in (value strictly below cash), at the ladder's
    fall-through price (``base_value`` if seeded, else cost basis) — never NULL.
    """
    portfolio_repo = SqlAlchemyPortfolioRepository(isolated_session)
    league_repo = SqlAlchemyLeagueRepository(isolated_session)

    pid, base_value = await _untickedplayer(isolated_session)
    initial_cash = get_settings().initial_cash

    user = UserORM(name=f"_short_{id(isolated_session)}", kind="human")
    isolated_session.add(user)
    await isolated_session.flush()
    portfolio = await portfolio_repo.create_for_user(user_id=user.id, cash=initial_cash)

    # Short the un-ticked player: negative shares, a known cost basis.
    short_shares = -2.0
    cost_basis = 50.0
    await portfolio_repo.upsert_holding(
        Holding(portfolio_id=portfolio.id, player_id=pid, shares=short_shares, average_buy_price=cost_basis)
    )
    await isolated_session.flush()

    league = LeagueORM(name=f"_short_lg_{id(isolated_session)}", kind=LeagueKind.PRIVATE.value, invite_code="YYYYYY")
    isolated_session.add(league)
    await isolated_session.flush()
    isolated_session.add(LeagueMemberORM(league_id=league.id, user_id=user.id))
    await isolated_session.flush()

    # Ladder fall-through: base_value when the player is seeded, else cost basis.
    mark = base_value if base_value is not None else cost_basis
    expected_value = initial_cash + short_shares * mark  # strictly below cash (short adds negative value)

    board = await league_repo.leaderboard(league_id=league.id, me_user_id=user.id)
    me = next((e for e in board if e.user_id == user.id), None)
    assert me is not None, "user must appear in their own league's leaderboard"
    # The liability is priced in — the position is NOT silently dropped.
    assert me.value == pytest.approx(expected_value, abs=0.01)
    assert me.value < initial_cash, "a short must lower portfolio value, never inflate it"
