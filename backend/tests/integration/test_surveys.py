"""Integration test for the surveys repo (DB-backed, rolled back).

A new question appears for a user until they answer (or skip) it; the first
answer wins and a re-answer is a no-op. Skips when the local Postgres is
unreachable (CI has no DB).
"""

from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.survey import SurveyAnswerORM
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.survey import SqlAlchemySurveyRepository

pytestmark = pytest.mark.anyio


async def test_list_excludes_answered_and_first_answer_wins(isolated_session: AsyncSession) -> None:
    session = isolated_session
    user = UserORM(name=f"_svy_{id(session)}", kind="human")
    session.add(user)
    await session.flush()

    repo = SqlAlchemySurveyRepository(session)
    question_id = await repo.create(
        code=f"_svy_q_{id(session)}",
        title="Would you invest real money in a football player?",
        body=None,
        kind="yes_no_amount",
    )
    await session.flush()

    # Visible before answering.
    before = await repo.list_active_unanswered(user.id)
    assert any(q.id == question_id for q in before)

    # Answered -> excluded for this user.
    await repo.answer(
        question_id=question_id,
        user_id=user.id,
        answer_bool=True,
        answer_amount=Decimal("150"),
        answer_text=None,
    )
    await session.flush()
    after = await repo.list_active_unanswered(user.id)
    assert all(q.id != question_id for q in after)

    # Re-answer is a no-op: the first answer is kept.
    await repo.answer(
        question_id=question_id,
        user_id=user.id,
        answer_bool=False,
        answer_amount=None,
        answer_text=None,
    )
    await session.flush()
    stored = (
        await session.execute(
            select(SurveyAnswerORM).where(
                SurveyAnswerORM.question_id == question_id, SurveyAnswerORM.user_id == user.id
            )
        )
    ).scalar_one()
    assert stored.answer_bool is True
    assert stored.answer_amount == Decimal("150")


async def test_skip_is_recorded_and_question_not_reasked(isolated_session: AsyncSession) -> None:
    session = isolated_session
    user = UserORM(name=f"_svy_skip_{id(session)}", kind="human")
    session.add(user)
    await session.flush()

    repo = SqlAlchemySurveyRepository(session)
    question_id = await repo.create(code=f"_svy_skip_q_{id(session)}", title="Skippable?", body=None, kind="yes_no")
    await session.flush()

    # Skip = all-NULL payload; still counts as answered.
    await repo.answer(question_id=question_id, user_id=user.id, answer_bool=None, answer_amount=None, answer_text=None)
    await session.flush()
    after = await repo.list_active_unanswered(user.id)
    assert all(q.id != question_id for q in after)
