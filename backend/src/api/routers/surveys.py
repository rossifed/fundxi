"""/api/surveys — product-research questions for SIGNED-IN users.

GET returns the active questions the caller has not yet answered; POST
``/{id}/answer`` stores the answer — or a skip when the payload is empty —
so each question is asked exactly once per account (across devices). Both
require auth (anonymous → 401): we only survey signed-in users.
"""

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user_id, get_session
from src.infrastructure.db.repositories.survey import SqlAlchemySurveyRepository

router = APIRouter(prefix="/api/surveys", tags=["surveys"])


class SurveyQuestionDTO(BaseModel):
    id: int
    code: str
    title: str
    body: str | None
    kind: str
    published_at: datetime


class SurveyAnswerIn(BaseModel):
    """Empty payload = skip (recorded, so the question is never re-asked)."""

    answer_bool: bool | None = None
    answer_amount: Decimal | None = Field(default=None, ge=0)
    answer_text: str | None = Field(default=None, max_length=2000)


@router.get("", response_model=list[SurveyQuestionDTO])
async def list_surveys(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> list[SurveyQuestionDTO]:
    items = await SqlAlchemySurveyRepository(session).list_active_unanswered(user_id)
    return [
        SurveyQuestionDTO(id=q.id, code=q.code, title=q.title, body=q.body, kind=q.kind, published_at=q.published_at)
        for q in items
    ]


@router.post("/{question_id}/answer")
async def answer_survey(
    question_id: int,
    payload: SurveyAnswerIn,
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    # An amount only makes sense on a "yes": drop it otherwise so the stored
    # rows stay unambiguous for analysis (no "no, but 500" artifacts).
    amount = payload.answer_amount if payload.answer_bool is True else None
    await SqlAlchemySurveyRepository(session).answer(
        question_id=question_id,
        user_id=user_id,
        answer_bool=payload.answer_bool,
        answer_amount=amount,
        answer_text=payload.answer_text,
    )
    await session.commit()
    return {"status": "ok"}
