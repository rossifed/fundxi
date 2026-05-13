"""Unit tests for the simulation wipe Use Case.

Strategy: feed the use case with a fake ``WipeExecutor`` that records
calls. The use case is pure orchestration, so this is enough; the SQL
behaviour of the real adapter is covered by integration tests against
Postgres (not part of this POC).
"""

from dataclasses import dataclass, field

import pytest

from src.simulation.application.wipe_replay_state import wipe_fixture_replay_state, wipe_replay_state
from src.simulation.domain.wipe_scope import WipeScope


@dataclass(slots=True)
class _RecordingWipeExecutor:
    """Fake WipeExecutor that records the sequence of calls."""

    calls: list[str] = field(default_factory=list)
    fixture_wipes: list[int] = field(default_factory=list)

    async def wipe_simulation_data(self) -> None:
        self.calls.append("simulation_data")

    async def wipe_user_session(self) -> None:
        self.calls.append("user_session")

    async def wipe_fixture_data(self, fixture_internal_id: int) -> None:
        self.calls.append("fixture_data")
        self.fixture_wipes.append(fixture_internal_id)


@pytest.mark.anyio
async def test_data_only_scope_clears_simulation_data_only() -> None:
    executor = _RecordingWipeExecutor()

    await wipe_replay_state(executor, WipeScope.DATA_ONLY)

    assert executor.calls == ["simulation_data"]


@pytest.mark.anyio
async def test_full_scope_clears_simulation_data_then_user_session() -> None:
    executor = _RecordingWipeExecutor()

    await wipe_replay_state(executor, WipeScope.FULL)

    assert executor.calls == ["simulation_data", "user_session"]


@pytest.mark.anyio
async def test_fixture_wipe_targets_only_the_given_fixture() -> None:
    executor = _RecordingWipeExecutor()

    await wipe_fixture_replay_state(executor, 65)

    assert executor.calls == ["fixture_data"]
    assert executor.fixture_wipes == [65]
