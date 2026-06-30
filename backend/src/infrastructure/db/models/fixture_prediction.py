"""FixturePredictionORM — frozen pre-match result probability per fixture.

DDD role: Adapter (persistence). One row per fixture, holding the Sportmonks
``FULLTIME_RESULT_PROBABILITY`` (prediction type 237) — home/draw/away win
probabilities as fractions — captured before kick-off and FROZEN at the whistle
(the poller stops overwriting once the match is no longer upcoming).

It is the "market price" the odds-based knockout settlement reads: a team that
advances is rewarded in proportion to how UNLIKELY its win was (back the
underdog → win big), a team eliminated is penalised in proportion to how
EXPECTED its win was (a flopping favourite drops hard). The raw provider payload
is archived in ``raw.sportmonks_event``; this is the projection settlement uses.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class FixturePredictionORM(Base):
    __tablename__ = "fixture_prediction"
    __table_args__ = ({"schema": "core"},)

    fixture_id: Mapped[int] = mapped_column(ForeignKey("core.fixture.id", ondelete="CASCADE"), primary_key=True)
    # FULLTIME_RESULT_PROBABILITY (Sportmonks prediction type 237) as fractions
    # in [0,1], normalised to sum to 1. The knockout "advance" probability folds
    # the draw onto each side (draw → extra time / penalties ≈ 50/50) at use.
    p_home: Mapped[float] = mapped_column(Numeric(6, 5))
    p_draw: Mapped[float] = mapped_column(Numeric(6, 5))
    p_away: Mapped[float] = mapped_column(Numeric(6, 5))
    # When the probability was last captured (frozen at the last pre-kickoff poll).
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Provenance, e.g. "sportmonks:237".
    source: Mapped[str] = mapped_column(String(32))
