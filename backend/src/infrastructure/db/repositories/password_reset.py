"""SqlAlchemyPasswordResetRepository — Adapter for password-reset tokens.

Thin persistence surface: create a token row, fetch the latest one for a
user (throttling), look one up by digest, and mark it used. Validity rules
(expiry, single-use) live in the application service, not here.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.password_reset import PasswordResetORM


class SqlAlchemyPasswordResetRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, *, user_id: int, token_hash: str, expires_at: datetime) -> PasswordResetORM:
        row = PasswordResetORM(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row

    async def get_by_token_hash(self, token_hash: str) -> PasswordResetORM | None:
        result = await self._session.execute(
            select(PasswordResetORM).where(PasswordResetORM.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def latest_for_user(self, user_id: int) -> PasswordResetORM | None:
        """Most recently created token for a user — used to throttle re-requests."""
        result = await self._session.execute(
            select(PasswordResetORM)
            .where(PasswordResetORM.user_id == user_id)
            .order_by(PasswordResetORM.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def mark_used(self, row: PasswordResetORM, *, used_at: datetime) -> None:
        row.used_at = used_at
        await self._session.flush()
