"""derive_team_colors — populate core.team.color from the kit palette.

DDD role: Application Service. A team's colour is the PRIMARY shirt colour
Sportmonks reports for its home kit — slot 0 of ``core.fixture.home_kit_palette``
— never invented. Teams with no kit-palette fixture yet keep a null colour; the
UI then falls back to a neutral surface.

Slot 0 is taken directly (not a frequency vote over all 11 slots): the palette
also carries fixed "artefact" slots (#C40010 red / #0046A8 blue at indices 4-5,
present in ~every row) that a vote lets WIN, mis-colouring teams (Senegal would
render red instead of its green, England blue instead of white, etc.). Slot 0 is
the actual shirt colour: SUI #C40010 red, ENG/GER #F0F0F0 white, ARG #7FC2DF sky,
BRA #FBED32 yellow — all verified on the WC2022/2026 dataset.
"""

from collections import Counter

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger(__name__)


async def derive_team_colors(session: AsyncSession) -> int:
    """Recompute core.team.color (= primary kit slot) for every team that has
    home-kit palette data. Returns the number of teams updated."""
    rows = await session.execute(
        text(
            "SELECT home_team_id, home_kit_palette FROM core.fixture "
            "WHERE home_kit_palette IS NOT NULL"
        )
    )
    # A team can wear different home kits across fixtures → keep the most common
    # slot-0 (primary) value.
    primary_by_team: dict[str, Counter[str]] = {}
    for team_id, palette in rows:
        if not isinstance(palette, str):
            continue
        parts = [part.strip() for part in palette.split(",")]
        primary = parts[0] if parts else ""
        if primary:
            primary_by_team.setdefault(team_id, Counter())[primary] += 1

    updated = 0
    for team_id, counts in primary_by_team.items():
        accent = counts.most_common(1)[0][0]
        await session.execute(
            text("UPDATE core.team SET color = :color WHERE id = :id"),
            {"color": accent, "id": team_id},
        )
        updated += 1
    log.info("derive_team_colors.done", updated=updated, teams_with_kit=len(primary_by_team))
    return updated
