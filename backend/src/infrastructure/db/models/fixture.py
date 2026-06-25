"""FixtureORM — persistence Adapter for the Fixture Aggregate Root.

DDD role: Adapter. Domain ↔ ORM translation is the Repository's job.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.db.base import Base
from src.infrastructure.db.models._mixins import AuditMixin


class FixtureORM(Base, AuditMixin):
    __tablename__ = "fixture"
    __table_args__ = {"schema": "core"}

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sportmonks_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True)
    # Sportmonks season id (native in every fixture payload). Scopes a
    # fixture to its tournament so the API shows one competition at a
    # time (WC2022 and WC2026 coexist in this table).
    season_id: Mapped[int | None] = mapped_column(index=True)
    home_team_id: Mapped[str] = mapped_column(ForeignKey("core.team.id", ondelete="RESTRICT"), index=True)
    away_team_id: Mapped[str] = mapped_column(ForeignKey("core.team.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    group: Mapped[str] = mapped_column(String(8), index=True)
    home_score: Mapped[int | None]
    away_score: Mapped[int | None]
    kickoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    minute: Mapped[int | None]
    note: Mapped[str | None] = mapped_column(Text)
    # Per-match kit colors (hex), from Sportmonks fixture metadata type_id
    # 161 (home) / 162 (away). Nullable: only set once the fixture has been
    # ingested via bootstrap_fixture_details. ``*_color`` is the primary
    # ``values.participant`` hex; ``*_palette`` is the raw CSV
    # ``values.kit`` string (shirt/shorts/socks/GK/variants, undocumented).
    home_kit_color: Mapped[str | None] = mapped_column(String(7))
    away_kit_color: Mapped[str | None] = mapped_column(String(7))
    home_kit_palette: Mapped[str | None] = mapped_column(String(255))
    away_kit_palette: Mapped[str | None] = mapped_column(String(255))
    # Tactical formation each team played in this fixture (e.g. "4-3-3").
    # From Sportmonks fixture metadata (type_id 159) or the formations include.
    home_formation: Mapped[str | None] = mapped_column(String(16))
    away_formation: Mapped[str | None] = mapped_column(String(16))
    # Stadium + tournament phase, ingested from Sportmonks ``venue``,
    # ``stage`` and ``round`` includes. Nullable: a re-run of
    # ``bootstrap_fixture_details`` populates them.
    venue_id: Mapped[int | None] = mapped_column(ForeignKey("core.venue.id", ondelete="SET NULL"))
    stage_name: Mapped[str | None] = mapped_column(String(60))
    round_name: Mapped[str | None] = mapped_column(String(60))
    # Fine-grained CURRENT Sportmonks state (raw code, e.g. "HT",
    # "INPLAY_2ND_HALF", "FT") + the wall-clock when we first observed THIS
    # state. The coarse ``status`` above stays (derived as before); these add the
    # granularity we pay for and drive the live trading gate (lock during play,
    # re-open at half-time / full-time after a buffer counted from
    # ``state_changed_at``). The full state object per transition is logged in
    # core.fixture_state_event. Nullable: the poller backfills as fixtures are
    # observed.
    state_code: Mapped[str | None] = mapped_column(String(32))
    state_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
