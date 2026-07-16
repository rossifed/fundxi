"""SqlAlchemySurveyRepository — Adapter for product-research surveys."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.survey import SurveyQuestion
from src.infrastructure.db.models.survey import SurveyAnswerORM, SurveyQuestionORM


class SqlAlchemySurveyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_active_unanswered(self, user_id: int) -> list[SurveyQuestion]:
        """Active questions this user has NOT yet answered or skipped, oldest first."""
        answered = select(SurveyAnswerORM.question_id).where(SurveyAnswerORM.user_id == user_id)
        rows = await self._session.execute(
            select(SurveyQuestionORM)
            .where(SurveyQuestionORM.active.is_(True))
            .where(SurveyQuestionORM.id.not_in(answered))
            .order_by(SurveyQuestionORM.published_at.asc())
        )
        return [
            SurveyQuestion(id=r.id, code=r.code, title=r.title, body=r.body, kind=r.kind, published_at=r.published_at)
            for r in rows.scalars().all()
        ]

    async def answer(
        self,
        *,
        question_id: int,
        user_id: int,
        answer_bool: bool | None,
        answer_amount: Decimal | None,
        answer_text: str | None,
    ) -> None:
        """Record a user's answer (all-NULL payload = skip). First answer wins; re-answer is a no-op."""
        stmt = (
            pg_insert(SurveyAnswerORM)
            .values(
                question_id=question_id,
                user_id=user_id,
                answer_bool=answer_bool,
                answer_amount=answer_amount,
                answer_text=answer_text,
            )
            .on_conflict_do_nothing(index_elements=["question_id", "user_id"])
        )
        await self._session.execute(stmt)

    async def create(self, *, code: str, title: str, body: str | None, kind: str) -> int:
        """Insert a new question; returns its id. Used by the admin posting script."""
        row = SurveyQuestionORM(code=code, title=title, body=body, kind=kind)
        self._session.add(row)
        await self._session.flush()
        return row.id
