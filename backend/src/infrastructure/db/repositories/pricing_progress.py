"""SqlAlchemyPricingProgressRepository — read/write the pricing watermark."""

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.pricing_progress import PricingProgressORM


class SqlAlchemyPricingProgressRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_last_event_id(self) -> int:
        result = await self._session.execute(
            select(PricingProgressORM.last_event_id).where(PricingProgressORM.singleton == 1)
        )
        value = result.scalar_one_or_none()
        return value if isinstance(value, int) else 0

    async def set_last_event_id(self, last_event_id: int) -> None:
        await self._session.execute(
            update(PricingProgressORM)
            .where(PricingProgressORM.singleton == 1)
            .values(last_event_id=last_event_id, updated_at=func.now())
        )
