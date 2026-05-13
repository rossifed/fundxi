"""Clear the live store ahead of a new replay.

DDD role: Application Service / Use Case. Pure orchestration over the
``WipeExecutor`` port — no DB, no logging, no branching beyond scope
dispatch.
"""

from src.simulation.domain.ports import WipeExecutor
from src.simulation.domain.wipe_scope import WipeScope


async def wipe_replay_state(executor: WipeExecutor, scope: WipeScope) -> None:
    """Wipe simulation state at the requested scope.

    With ``DATA_ONLY`` only the replayable data is cleared; with
    ``FULL`` the user's portfolio, holdings and trades are also
    cleared. The default user record is preserved in either case so a
    bootstrap step is not required between successive runs.
    """
    await executor.wipe_simulation_data()
    if scope is WipeScope.FULL:
        await executor.wipe_user_session()


async def wipe_fixture_replay_state(executor: WipeExecutor, fixture_internal_id: int) -> None:
    """Wipe one fixture's replayable data, leaving every other fixture intact.

    The narrow counterpart of ``wipe_replay_state(DATA_ONLY)``: use it
    to re-run a single match without disturbing the rest of the live
    store. Tournament-level aggregates with no per-fixture key are not
    cleared — see ``WipeExecutor.wipe_fixture_data``.
    """
    await executor.wipe_fixture_data(fixture_internal_id)
