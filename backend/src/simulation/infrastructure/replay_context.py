"""Shared context loaders for replay driving adapters.

DDD role: Infrastructure helpers. Loaded by every driving adapter
(CLI, GUI) that needs the read-only context required to start a
replay: sportmonks ↔ internal id maps, the fixture's kickoff time,
and the initial price book. Living here rather than in the CLI
avoids private-import coupling between adapters.
"""

import contextlib
from datetime import datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.lineup import LineupORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.team import TeamORM
from src.infrastructure.db.price_tick_writer import price_tick_row, upsert_price_ticks
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation
from src.simulation.domain.price_state import PriceState
from src.valuation.strategies.layered_v1 import TeamRosters


async def _tournament_open_ts(session: AsyncSession) -> datetime | None:
    """The pre-tournament anchor timestamp: earliest fixture kickoff
    minus 1 day. MUST match ``wc_replay``'s ``tournament_start`` derivation
    (``src/application/wc_replay.py``) so the baseline tick this seeds
    and the one the batch job seeds collide on the (player_id, ts) PK
    and dedupe instead of producing two anchors. ``None`` when no
    fixture has a kickoff (nothing to anchor against)."""
    earliest = (
        await session.execute(
            select(FixtureORM.kickoff_at)
            .where(FixtureORM.kickoff_at.is_not(None))
            .order_by(FixtureORM.kickoff_at)
            .limit(1)
        )
    ).scalar_one_or_none()
    return earliest - timedelta(days=1) if earliest is not None else None


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


async def seed_baseline_ticks(session: AsyncSession, price_state: PriceState) -> int:
    """Write the pre-tournament anchor tick for every player.

    One tick per player at the pre-tournament anchor ts (earliest
    kickoff minus 1 day, see ``_tournament_open_ts``), ``fixture_id IS
    NULL``, ``current_price = base_value``, ``change_since_open = 0.0``.
    This is the anchor ``EngineValuationProvider`` (and the screener)
    divide by for the total-change metric; without it the first
    *post-event* tick is mistaken for the baseline and the total is
    understated.

    Idempotent: ``ON CONFLICT (player_id, ts) DO NOTHING`` — re-runs,
    multi-fixture replays, and the batch ``wc_replay`` (same ts formula)
    seed it exactly once, so the running total accumulates across
    matches instead of resetting. Written straight to PG (no NATS
    fan-out): a flat 0% baseline is not a price move. Returns 0 when
    there is no fixture to anchor against.
    """
    anchor_ts = await _tournament_open_ts(session)
    if anchor_ts is None:
        return 0
    rows = [
        price_tick_row(
            player_id=player_id,
            ts=anchor_ts,
            fixture_id=None,
            current_price=round(base_value, 2),
            performance_rating=6.5,
            change_since_open=0.0,
            source="engine",
        )
        for player_id, base_value in price_state.current_price_by_player.items()
    ]
    return await upsert_price_ticks(session, rows)


async def load_fixture_rosters(session: AsyncSession, *, fixture_sportmonks_id: int) -> TeamRosters:
    """Per-team rosters (player_id + position) for one fixture's lineup.

    Feeds layer-4 team propagation in the shared pricing kernel so the
    simulator reproduces exactly what the batch ``wc_replay`` produces.
    Empty rosters (no lineup ingested) → propagation is simply skipped.
    """
    fx = (
        await session.execute(
            select(FixtureORM.id, FixtureORM.home_team_id, FixtureORM.away_team_id).where(
                FixtureORM.sportmonks_id == fixture_sportmonks_id
            )
        )
    ).first()
    if fx is None:
        raise LookupError(f"fixture sportmonks_id={fixture_sportmonks_id} not found in core.fixture")
    rows = (
        await session.execute(
            select(LineupORM.team_id, LineupORM.player_id, LineupORM.position).where(LineupORM.fixture_id == fx.id)
        )
    ).all()
    by_team: dict[str, list[tuple[int, str]]] = {}
    for r in rows:
        by_team.setdefault(r.team_id, []).append((r.player_id, r.position))
    return TeamRosters(by_team=by_team, home_team_id=fx.home_team_id, away_team_id=fx.away_team_id)


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
