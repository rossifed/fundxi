"""Driven ports of the simulation bounded context.

DDD role: Protocols (Repository / Adapter ports). The application
layer depends on these abstractions; concrete implementations live in
``simulation/infrastructure/``.
"""

from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Protocol

from src.simulation.domain.replay_event import ReplayEvent
from src.simulation.domain.replay_fixture_bundle import ReplayFixtureBundle


class WipeExecutor(Protocol):
    """Port for clearing simulation state from the live store.

    Each method is an atomic unit from the caller's standpoint: it
    either completes entirely or leaves the store unchanged. Commit
    semantics belong to the surrounding session and are the wiring
    layer's responsibility, not the executor's.
    """

    async def wipe_simulation_data(self) -> None:
        """Clear time-varying tables that the replay engine refills."""
        ...

    async def wipe_user_session(self) -> None:
        """Clear user-owned portfolio state (portfolio, holdings, trades)."""
        ...

    async def wipe_fixture_data(self, fixture_internal_id: int) -> None:
        """Clear one fixture's replayable data only (events, comments, ticks).

        Scoped counterpart of :meth:`wipe_simulation_data`: leaves every
        other fixture untouched. Tournament-level aggregates that have
        no per-fixture key (rolled-up player stats, daily snapshots) are
        *not* touched and may be left stale until a full wipe + rebuild.
        """
        ...


class FixtureProgressWriter(Protocol):
    """Port for reflecting a replay's progress onto the fixture row.

    ``advance`` marks the fixture ``live`` at the given game minute and
    recomputes its score from the goal events written so far (same
    transaction — uncommitted inserts are visible). ``finish`` returns
    the fixture to ``finished`` once the replay ends. Commit semantics
    belong to the surrounding session.
    """

    async def advance(self, *, fixture_internal_id: int, minute: int) -> None: ...

    async def finish(self, *, fixture_internal_id: int) -> None: ...


class ReplayArchiveReader(Protocol):
    """Port for loading a recorded fixture's timeline from the raw archive."""

    async def load_fixture_timeline(self, fixture_sportmonks_id: int) -> ReplayFixtureBundle:
        """Return the fixture's internal id and its sorted timeline.

        Raises ``LookupError`` when no archive exists for that fixture
        or when the fixture's internal id cannot be resolved.
        """
        ...


class LiveDataSink(Protocol):
    """Port for emitting one timeline event into the live store.

    Implementations call the same projector + repository code as the
    live ingest worker, so the replay path exercises the production
    write pipeline end to end.
    """

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None: ...


class PlayerPriceTickWriter(Protocol):
    """Port for appending one row to ``valuation.player_price_tick``.

    The simulation invokes this once per impactful event so the live
    store reflects price moves in real time.
    """

    async def insert(
        self,
        *,
        player_id: int,
        ts: datetime,
        fixture_id: int | None,
        current_price: float,
        performance_rating: float,
        change_since_open: float,
    ) -> None: ...


class ReplayController(Protocol):
    """Out-of-band control over an in-flight replay (pause / stop).

    ``replay_match`` consults the controller at every game-minute
    boundary. The default — no controller at all — means the replay
    runs to completion uninterrupted; the CLI and the unit tests rely
    on that. Only the GUI, which can pause or stop a run from another
    thread, supplies one.
    """

    def stop_requested(self) -> bool:
        """True once the caller wants the replay to halt early."""
        ...

    async def wait_while_paused(self) -> None:
        """Block while the caller has the replay paused; return when resumed.

        Returns immediately when not paused. Should also return
        promptly if a stop is requested while paused, so the replay can
        observe the stop and unwind.
        """
        ...


# Sleep abstraction so the use case can be exercised without real-time
# delays in tests. Production wires ``asyncio.sleep``.
SleepFn = Callable[[float], Awaitable[None]]
