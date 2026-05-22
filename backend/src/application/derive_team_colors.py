"""derive_team_colors — populate core.team.color from kit palettes.

DDD role: Application Service. A team's accent colour is derived from
the colours Sportmonks reports for its home kits (core.fixture kit
palettes) through the ``pick_accent_color`` domain service — never
invented. Teams with no kit-palette fixture yet keep a null colour;
the UI then falls back to a neutral surface.
"""

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.team.team_color import pick_accent_color

log = structlog.get_logger(__name__)


async def derive_team_colors(session: AsyncSession) -> int:
    """Recompute core.team.color for every team that has home-kit palette
    data. Returns the number of teams updated."""
    rows = await session.execute(
        text(
            "SELECT home_team_id, home_kit_palette FROM core.fixture "
            "WHERE home_kit_palette IS NOT NULL"
        )
    )
    # Sportmonks' 11-slot kit palette carries two fixed artefact slots at
    # indices 4 and 5 (#C40010 / #0046A8 in ~all rows) that are NOT team
    # colours — verified on the WC2022/2026 dataset. Drop them.
    artefact_slots = (4, 5)
    palettes_by_team: dict[str, list[str]] = {}
    for team_id, palette in rows:
        if not isinstance(palette, str):
            continue
        parts = [part.strip() for part in palette.split(",")]
        kit_colors = [c for i, c in enumerate(parts) if c and i not in artefact_slots]
        palettes_by_team.setdefault(team_id, []).extend(kit_colors)

    updated = 0
    for team_id, colors in palettes_by_team.items():
        accent = pick_accent_color(colors)
        if accent is None:
            continue
        await session.execute(
            text("UPDATE core.team SET color = :color WHERE id = :id"),
            {"color": accent, "id": team_id},
        )
        updated += 1
    log.info("derive_team_colors.done", updated=updated, teams_with_kit=len(palettes_by_team))
    return updated
