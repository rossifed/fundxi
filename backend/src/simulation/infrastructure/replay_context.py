"""Shared context loaders for replay driving adapters.

DDD role: Infrastructure helpers. Loaded by every driving adapter
(CLI, GUI) that needs the read-only context required to start a
replay: sportmonks ↔ internal id maps, the fixture's kickoff time,
and the initial price book. Living here rather than in the CLI
avoids private-import coupling between adapters.
"""

from datetime import datetime

from sqlalchemy import select
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
    player_id_by_smk: dict[int, int] = {
        row.sportmonks_id: row.id for row in players if row.sportmonks_id is not None
    }
    teams = (
        await session.execute(
            select(TeamORM.id, TeamORM.sportmonks_id).where(TeamORM.sportmonks_id.is_not(None))
        )
    ).all()
    team_id_by_smk: dict[int, str] = {
        row.sportmonks_id: row.id for row in teams if row.sportmonks_id is not None
    }
    return player_id_by_smk, team_id_by_smk


async def load_initial_price_state(session: AsyncSession, *, as_of: datetime) -> PriceState:
    """Seed a ``PriceState`` with the synthesised base value of every player.

    Matches what the batch ``wc_replay`` job does at startup so the
    pricing curve produced by a replay reproduces what a full batch
    rebuild would produce.
    """
    player_ids = (await session.execute(select(PlayerORM.id))).scalars().all()
    return PriceState(
        current_price_by_player={
            pid: synthesize_valuation(pid, as_of=as_of).base_value for pid in player_ids
        }
    )


async def load_fixture_kickoff(session: AsyncSession, *, fixture_sportmonks_id: int) -> datetime:
    row = (
        await session.execute(
            select(FixtureORM.kickoff_at).where(FixtureORM.sportmonks_id == fixture_sportmonks_id)
        )
    ).first()
    if row is None or row.kickoff_at is None:
        raise LookupError(
            f"fixture sportmonks_id={fixture_sportmonks_id} has no kickoff_at in core.fixture"
        )
    return row.kickoff_at
