"""SqlAlchemyUserRepository — Adapter for UserRepository."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.portfolio.user import User, UserKind
from src.infrastructure.db.models.user import UserORM


def _to_domain(orm: UserORM) -> User:
    return User(
        id=orm.id,
        name=orm.name,
        kind=UserKind(orm.kind),
        strategy=orm.strategy,
        created_at=orm.created_at,
    )


class SqlAlchemyUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_default_human(self) -> User | None:
        result = await self._session.execute(
            select(UserORM).where(UserORM.kind == UserKind.HUMAN.value).order_by(UserORM.id).limit(1)
        )
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None

    async def get_by_id(self, user_id: int) -> User | None:
        result = await self._session.execute(select(UserORM).where(UserORM.id == user_id))
        row = result.scalar_one_or_none()
        return _to_domain(row) if row else None

    async def list_bots(self) -> list[User]:
        result = await self._session.execute(
            select(UserORM).where(UserORM.kind == UserKind.BOT.value).order_by(UserORM.id)
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def create(self, *, name: str, kind: UserKind, strategy: str | None = None) -> User:
        orm = UserORM(name=name, kind=kind.value, strategy=strategy)
        self._session.add(orm)
        await self._session.flush()
        await self._session.refresh(orm)
        return _to_domain(orm)
