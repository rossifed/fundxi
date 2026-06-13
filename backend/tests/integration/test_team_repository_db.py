"""Integration tests for SqlAlchemyTeamRepository against the REAL DB.

Covers the provider-short_code-changed case (e.g. Haiti HTI→HAI): a team's
internal id is its short_code, but the stable identity is sportmonks_id. When
the provider returns the same sportmonks_id under a new short_code, the upsert
must update the existing row in place (keeping its id so FKs stay valid) instead
of inserting a colliding second row — which trips the unique sportmonks_id
constraint and aborted the whole daily refresh.

Isolation: runs inside a session that rolls back at teardown, so the suite
leaves the DB exactly as it found it.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.team.team import Team, TeamKind
from src.infrastructure.db.repositories.team import SqlAlchemyTeamRepository

# ``isolated_session`` fixture is shared via tests/integration/conftest.py.
pytestmark = pytest.mark.anyio

_SMK = 999_000_001  # synthetic sportmonks_id that cannot collide with real data


def _team(team_id: str, name: str) -> Team:
    return Team(
        id=team_id,
        name=name,
        flag="flag.png",
        color="",
        kind=TeamKind("national"),
        continent="North America",
        group=None,
        coach_name=None,
        coach_image_path=None,
        coach_nationality=None,
    )


async def _rows(session: AsyncSession) -> list[tuple[str, int, str]]:
    result = await session.execute(
        text("SELECT id, sportmonks_id, name FROM core.team WHERE sportmonks_id = :smk"),
        {"smk": _SMK},
    )
    return [(r[0], r[1], r[2]) for r in result.all()]


async def _color(session: AsyncSession, team_id: str) -> str | None:
    return await session.scalar(text("SELECT color FROM core.team WHERE id = :id"), {"id": team_id})


async def test_changed_short_code_updates_in_place_without_collision(isolated_session: AsyncSession) -> None:
    repo = SqlAlchemyTeamRepository(isolated_session)

    # First sync: the team arrives under short_code "ZZ1".
    assert await repo.upsert(_team("ZZ1", "Testland"), sportmonks_id=_SMK) == "ZZ1"
    assert await _rows(isolated_session) == [("ZZ1", _SMK, "Testland")]

    # Next sync: the provider changed the short_code to "ZZ2" for the SAME
    # sportmonks_id. Must not raise a unique-constraint violation, must not
    # create a second row, must keep the original id (FK safety), AND return
    # that effective id so callers (fixtures/squads) reference a real row.
    effective_id = await repo.upsert(_team("ZZ2", "Testland Renamed"), sportmonks_id=_SMK)
    assert effective_id == "ZZ1"

    rows = await _rows(isolated_session)
    assert rows == [("ZZ1", _SMK, "Testland Renamed")]
    # No new "ZZ2" row leaked in.
    assert not (await isolated_session.execute(text("SELECT 1 FROM core.team WHERE id = 'ZZ2'"))).first()


async def test_same_id_resync_updates_normally(isolated_session: AsyncSession) -> None:
    repo = SqlAlchemyTeamRepository(isolated_session)
    await repo.upsert(_team("ZZ1", "Testland"), sportmonks_id=_SMK)
    # Same id + same sportmonks_id ⇒ the ordinary on-conflict(id) path updates.
    await repo.upsert(_team("ZZ1", "Testland Updated"), sportmonks_id=_SMK)
    assert await _rows(isolated_session) == [("ZZ1", _SMK, "Testland Updated")]


async def test_resync_preserves_derived_color(isolated_session: AsyncSession) -> None:
    # color is a DERIVED column (set by derive_team_colors from kit palettes),
    # not provider data. A provider re-sync carries only the empty placeholder,
    # so the on-conflict(id) path must NOT clobber the stored colour — otherwise
    # the daily refresh leaves every team colourless.
    repo = SqlAlchemyTeamRepository(isolated_session)
    await repo.upsert(_team("ZZ1", "Testland"), sportmonks_id=_SMK)
    # Simulate derive_team_colors having computed an accent.
    await isolated_session.execute(text("UPDATE core.team SET color = '#C40010' WHERE id = 'ZZ1'"))

    # Provider re-sync with the empty placeholder colour.
    await repo.upsert(_team("ZZ1", "Testland Updated"), sportmonks_id=_SMK)

    assert await _color(isolated_session, "ZZ1") == "#C40010"


async def test_changed_short_code_preserves_derived_color(isolated_session: AsyncSession) -> None:
    # Same guarantee on the update-in-place (short_code changed) path.
    repo = SqlAlchemyTeamRepository(isolated_session)
    await repo.upsert(_team("ZZ1", "Testland"), sportmonks_id=_SMK)
    await isolated_session.execute(text("UPDATE core.team SET color = '#009C3B' WHERE id = 'ZZ1'"))

    await repo.upsert(_team("ZZ2", "Testland Renamed"), sportmonks_id=_SMK)

    assert await _color(isolated_session, "ZZ1") == "#009C3B"
