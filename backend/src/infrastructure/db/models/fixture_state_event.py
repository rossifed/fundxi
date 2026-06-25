"""FixtureStateEventORM — append-only log of observed Sportmonks state changes.

DDD role: Adapter (raw state-transition sink). One row per observed CHANGE of a
fixture's Sportmonks state, carrying the FULL provider ``state`` object (JSONB),
the live match minute and the wall-clock observation time. We pay for this
granularity (INPLAY_1ST_HALF / HT / INPLAY_2ND_HALF / BREAK / EXTRA_TIME /
PEN_LIVE / FT / AET / FT_PEN ...) — the coarse ``core.fixture.status`` collapses
it, so this keeps the full signal for simulation replay and phase-timing audit.

The fast-read current-state cache lives on ``core.fixture`` (``state_code`` +
``state_changed_at``); this log is the source of truth behind it.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base


class FixtureStateEventORM(Base):
    __tablename__ = "fixture_state_event"
    __table_args__ = (
        Index("ix_core_fixture_state_event_fixture_observed", "fixture_id", "observed_at"),
        {"schema": "core"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    fixture_id: Mapped[int] = mapped_column(ForeignKey("core.fixture.id", ondelete="CASCADE"))
    # Raw Sportmonks state code, e.g. "HT", "INPLAY_2ND_HALF", "FT".
    state_code: Mapped[str] = mapped_column(String(32))
    # The full Sportmonks ``state`` object (id/state/name/short_name/...), kept
    # verbatim so a replay never loses provider nuance.
    state: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Live match minute at the moment of observation (None when not ticking).
    minute: Mapped[int | None] = mapped_column(Integer)
    # Wall-clock when we OBSERVED this state (already includes the feed lag) —
    # the anchor the trading gate's re-open buffer counts from.
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
