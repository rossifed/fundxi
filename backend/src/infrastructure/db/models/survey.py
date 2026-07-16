"""SurveyQuestionORM + SurveyAnswerORM — product-research questions & per-user answers.

DDD role: Adapters. ``survey_question`` holds the pushed questions;
``survey_answer`` records one row per (question, user) — a real answer or a
skip (all payload columns NULL). The row's existence doubles as the ack, so a
question is asked exactly once per account, across devices.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class SurveyQuestionORM(Base):
    __tablename__ = "survey_question"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(String(16))  # 'yes_no' | 'yes_no_amount' | 'text'
    active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SurveyAnswerORM(Base):
    __tablename__ = "survey_answer"
    __table_args__ = {"schema": "app"}

    question_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("app.survey_question.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("app.user.id", ondelete="CASCADE"), primary_key=True)
    answer_bool: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    answer_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
