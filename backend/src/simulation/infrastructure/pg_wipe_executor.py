"""SQLAlchemy adapter for the ``WipeExecutor`` port.

DDD role: Adapter (driven). The lists of tables in each scope are the
single source of truth for what counts as "simulation data" vs "user
session" — kept here at the infrastructure boundary, never leaked
into the domain.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Time-varying tables refilled by the replay engine on every run.
# Order is irrelevant under ``TRUNCATE ... CASCADE``.
_SIMULATION_TABLES: tuple[str, ...] = (
    "core.match_comment_player_mention",
    "core.match_comment",
    "core.match_event",
    "core.player_tournament_stat",
    "valuation.player_daily_snapshot",
    "valuation.player_price_tick",
)

# User-owned state. ``app.user`` is intentionally excluded so the
# default identity survives a wipe; otherwise the bootstrap_user
# worker would need to be re-run before the app can be used again.
_USER_SESSION_TABLES: tuple[str, ...] = (
    "app.trade",
    "app.holding",
    "app.portfolio",
)

# Replayable tables that carry a ``fixture_id`` column, deletable in
# place for a single fixture. ``match_comment_player_mention`` is not
# listed: its FK to ``match_comment`` is ``ON DELETE CASCADE``, so it
# is cleared automatically when the parent comments go.
_FIXTURE_SCOPED_TABLES: tuple[str, ...] = (
    "core.match_comment",
    "core.match_event",
    "valuation.player_price_tick",
)

# After wiping a fixture's replayable rows, return the fixture row itself
# to its pre-replay (idle) state: not in play, no clock, no score. A
# fresh replay re-derives all of these.
_RESET_FIXTURE_SQL = text(
    "UPDATE core.fixture SET status = 'finished', minute = NULL, home_score = NULL, away_score = NULL "
    "WHERE id = :fixture_id"
)


@dataclass(frozen=True, slots=True)
class SqlAlchemyWipeExecutor:
    """Concrete ``WipeExecutor`` backed by an ``AsyncSession``.

    Each public method issues a single ``TRUNCATE ... RESTART IDENTITY
    CASCADE``. The session's transactional boundary is owned by the
    caller (CLI); the executor only emits statements.
    """

    session: AsyncSession

    async def wipe_simulation_data(self) -> None:
        await self._truncate(_SIMULATION_TABLES)

    async def wipe_user_session(self) -> None:
        await self._truncate(_USER_SESSION_TABLES)

    async def wipe_fixture_data(self, fixture_internal_id: int) -> None:
        # Table names come from the fixed ``_FIXTURE_SCOPED_TABLES`` allowlist;
        # the fixture id is bound as a parameter.
        for table in _FIXTURE_SCOPED_TABLES:
            await self.session.execute(
                text(f"DELETE FROM {table} WHERE fixture_id = :fixture_id"),
                {"fixture_id": fixture_internal_id},
            )
        await self.session.execute(_RESET_FIXTURE_SQL, {"fixture_id": fixture_internal_id})

    async def _truncate(self, tables: Sequence[str]) -> None:
        joined = ", ".join(tables)
        await self.session.execute(text(f"TRUNCATE {joined} RESTART IDENTITY CASCADE"))
