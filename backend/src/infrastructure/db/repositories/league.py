"""SqlAlchemyLeagueRepository — Adapter for LeagueRepository.

The leaderboard query is the only non-trivial piece: it values every
member's portfolio at the latest tick price
(``value = cash + sum(shares * current_price)``) and ranks descending.
A member who has not traded sits at ``value = cash = initial_cash``, so
``return_pct = 0`` (honest: that is their real state).
"""

from __future__ import annotations

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.league.league import LeaderboardEntry, League, LeagueKind
from src.infrastructure.db.models.league import LeagueMemberORM, LeagueORM


def _to_domain(orm: LeagueORM) -> League:
    return League(
        id=orm.id,
        name=orm.name,
        kind=LeagueKind(orm.kind),
        invite_code=orm.invite_code,
        created_by=orm.created_by,
        created_at=orm.created_at,
    )


_LEADERBOARD_SQL = text(
    """
    WITH latest_tick AS (
      SELECT DISTINCT ON (player_id) player_id, current_price
      FROM valuation.player_price_tick
      ORDER BY player_id, ts DESC
    ),
    member_value AS (
      SELECT
        u.id   AS user_id,
        u.name AS name,
        p.cash + COALESCE(SUM(h.shares * lt.current_price), 0) AS value
      FROM app.league_member lm
      JOIN app."user"      u  ON u.id = lm.user_id
      JOIN app.portfolio   p  ON p.user_id = u.id
      LEFT JOIN app.holding h ON h.portfolio_id = p.id
      LEFT JOIN latest_tick lt ON lt.player_id = h.player_id
      WHERE lm.league_id = :league_id
      GROUP BY u.id, u.name, p.cash
    )
    SELECT
      user_id,
      name,
      value,
      CASE WHEN :initial_cash > 0
           THEN ((value - :initial_cash) / :initial_cash) * 100.0
           ELSE 0 END AS return_pct
    FROM member_value
    ORDER BY value DESC, user_id ASC
    """
)


class SqlAlchemyLeagueRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_global(self) -> League | None:
        result = await self._session.execute(
            select(LeagueORM).where(LeagueORM.kind == LeagueKind.GLOBAL.value).order_by(LeagueORM.id).limit(1)
        )
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None

    async def get_by_id(self, league_id: int) -> League | None:
        result = await self._session.execute(select(LeagueORM).where(LeagueORM.id == league_id))
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None

    async def get_by_invite_code(self, code: str) -> League | None:
        result = await self._session.execute(select(LeagueORM).where(LeagueORM.invite_code == code))
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None

    async def create_private(self, *, name: str, created_by: int, invite_code: str) -> League:
        orm = LeagueORM(
            name=name,
            kind=LeagueKind.PRIVATE.value,
            invite_code=invite_code,
            created_by=created_by,
        )
        self._session.add(orm)
        await self._session.flush()
        await self._session.refresh(orm)
        return _to_domain(orm)

    async def add_member(self, *, league_id: int, user_id: int) -> None:
        self._session.add(LeagueMemberORM(league_id=league_id, user_id=user_id))
        await self._session.flush()

    async def is_member(self, *, league_id: int, user_id: int) -> bool:
        result = await self._session.execute(
            select(LeagueMemberORM.user_id).where(
                LeagueMemberORM.league_id == league_id,
                LeagueMemberORM.user_id == user_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def list_for_user(self, user_id: int) -> list[League]:
        result = await self._session.execute(
            select(LeagueORM)
            .join(LeagueMemberORM, LeagueMemberORM.league_id == LeagueORM.id)
            .where(LeagueMemberORM.user_id == user_id)
            # Global first, then private leagues by creation order.
            .order_by((LeagueORM.kind != LeagueKind.GLOBAL.value), LeagueORM.id)
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def member_count(self, league_id: int) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(LeagueMemberORM).where(LeagueMemberORM.league_id == league_id)
        )
        return int(result.scalar_one())

    async def leaderboard(self, *, league_id: int, me_user_id: int) -> list[LeaderboardEntry]:
        from src.config import get_settings

        initial_cash = get_settings().initial_cash
        rows = await self._session.execute(
            _LEADERBOARD_SQL, {"league_id": league_id, "initial_cash": initial_cash}
        )
        entries: list[LeaderboardEntry] = []
        for rank, row in enumerate(rows.mappings().all(), start=1):
            entries.append(
                LeaderboardEntry(
                    rank=rank,
                    user_id=int(row["user_id"]),
                    name=str(row["name"]),
                    value=float(row["value"]),
                    return_pct=round(float(row["return_pct"]), 2),
                    is_me=int(row["user_id"]) == me_user_id,
                )
            )
        return entries
