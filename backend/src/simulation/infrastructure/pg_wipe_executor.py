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

    async def _truncate(self, tables: Sequence[str]) -> None:
        joined = ", ".join(tables)
        await self.session.execute(text(f"TRUNCATE {joined} RESTART IDENTITY CASCADE"))
