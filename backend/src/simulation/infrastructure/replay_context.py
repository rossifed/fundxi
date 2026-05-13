"""Shared context loaders for replay driving adapters.

DDD role: Infrastructure helpers. Loaded by every driving adapter
(CLI, GUI) that needs the read-only context required to start a
replay: sportmonks ↔ internal id maps, the fixture's kickoff time,
and the initial price book. Living here rather than in the CLI
avoids private-import coupling between adapters.
"""

import contextlib
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.team import TeamORM
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation
from src.simulation.domain.price_state import PriceState


async def load_sportmonks_id_maps(session: AsyncSession) -> tuple[dict[int, int], dict[int, str]]:
    """Snapshot ``sportmonks_id → internal_id`` for players and teams.

    Required by the match-event projector. Snapshot semantics are
    sufficient: the simulation does not add players or teams at
    runtime.
    """
    players = (
        await session.execute(
            select(PlayerORM.id, PlayerORM.sportmonks_id).where(PlayerORM.sportmonks_id.is_not(None))
        )
    ).all()
    player_id_by_smk: dict[int, int] = {row.sportmonks_id: row.id for row in players if row.sportmonks_id is not None}
    teams = (
        await session.execute(select(TeamORM.id, TeamORM.sportmonks_id).where(TeamORM.sportmonks_id.is_not(None)))
    ).all()
    team_id_by_smk: dict[int, str] = {row.sportmonks_id: row.id for row in teams if row.sportmonks_id is not None}
    return player_id_by_smk, team_id_by_smk


async def load_initial_price_state(session: AsyncSession, *, as_of: datetime) -> PriceState:
    """Seed a ``PriceState`` with the synthesised base value of every player.

    Matches what the batch ``wc_replay`` job does at startup so the
    pricing curve produced by a replay reproduces what a full batch
    rebuild would produce.
    """
    player_ids = (await session.execute(select(PlayerORM.id))).scalars().all()
    return PriceState(
        current_price_by_player={pid: synthesize_valuation(pid, as_of=as_of).base_value for pid in player_ids}
    )


async def load_fixture_kickoff(session: AsyncSession, *, fixture_sportmonks_id: int) -> datetime:
    row = (
        await session.execute(select(FixtureORM.kickoff_at).where(FixtureORM.sportmonks_id == fixture_sportmonks_id))
    ).first()
    if row is None or row.kickoff_at is None:
        raise LookupError(f"fixture sportmonks_id={fixture_sportmonks_id} has no kickoff_at in core.fixture")
    return row.kickoff_at


# Fixed key for the process-spanning "one replay at a time" lock. A
# session-scoped Postgres advisory lock: held for the life of the
# connection (the whole replay) and released automatically when it
# closes — so a crashed replay never leaves it stuck.
_REPLAY_ADVISORY_LOCK_KEY = 778_2026


async def acquire_replay_lock(session: AsyncSession) -> None:
    """Take the global single-replay advisory lock on ``session``'s connection.

    Raises ``RuntimeError`` if another replay already holds it — enforcing
    "only one replay runs at any moment", across processes (CLI + GUI). The
    lock auto-releases when the connection closes (including on a crash), so
    it never deadlocks the next run.
    """
    got = (await session.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _REPLAY_ADVISORY_LOCK_KEY})).scalar()
    if not got:
        raise RuntimeError(
            "another replay is already running — only one replay can run at a time. "
            "Stop it first (the GUI's 'Restart replay' does this for you)."
        )


async def release_replay_lock(session: AsyncSession) -> None:
    """Release the single-replay advisory lock taken by ``acquire_replay_lock``.

    Best-effort: if the session is unusable (e.g. after a fatal error), the
    lock is released anyway when the connection closes. Always call from a
    ``finally`` so a pooled connection is not returned holding the lock.
    """
    # The lock also frees on connection close, so a failure here is harmless —
    # and cleanup must never mask the error that led us into a ``finally``.
    with contextlib.suppress(Exception):
        await session.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _REPLAY_ADVISORY_LOCK_KEY})


async def ensure_fixture_idle(session: AsyncSession, *, fixture_sportmonks_id: int) -> None:
    """Refuse to start a replay if the fixture is already marked ``live``.

    Two replays writing the same fixture row (e.g. a CLI run while a GUI
    run is in flight, or two GUI tabs) thrash its minute / score — the
    UI bounces between the two timelines. Fail fast with a clear message
    instead. ``finish`` (or "Wipe this fixture") returns it to idle.
    """
    row = (
        await session.execute(select(FixtureORM.status).where(FixtureORM.sportmonks_id == fixture_sportmonks_id))
    ).first()
    if row is not None and row.status == "live":
        raise RuntimeError(
            f"fixture sportmonks_id={fixture_sportmonks_id} is already 'live' — another replay is running, "
            "or a previous one was interrupted. Stop it (or 'Wipe this fixture') before starting a new replay."
        )
