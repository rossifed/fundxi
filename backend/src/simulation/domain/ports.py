"""Driven ports of the simulation bounded context.

DDD role: Protocols (Repository / Adapter ports). The application
layer depends on these abstractions; concrete implementations live in
``simulation/infrastructure/``.
"""

from collections.abc import Awaitable, Callable
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

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        ...


# Sleep abstraction so the use case can be exercised without real-time
# delays in tests. Production wires ``asyncio.sleep``.
SleepFn = Callable[[float], Awaitable[None]]
