"""ApplyQualifications — reward teams that reach the knockout bracket (+5%).

DDD role: Application Service. Group qualification is NOT a single fixture's
result, so it is not handled by ``settle_fixture``: a team's qualification is
known once it appears in a KNOCKOUT fixture (provider truth — Sportmonks fills
the knockout participants when the groups resolve). This use case runs
idempotently on the standings poller's cadence: each tick it finds teams that
have a knockout fixture but no qualification tick yet, and applies a flat
``w_qualification_frac`` (+5%) to every player of those squads.

The qualification tick is attached to the team's most recent FINISHED fixture
(its last group match — the moment it secured the spot), NOT ``fixture_id NULL``:
a NULL-fixture tick sorts ahead of fixtured ticks in the tournament-open anchor
query and would corrupt ``change_since_inception``. Idempotency is keyed on the
``qualification`` tick source, so a team is rewarded exactly once.
"""

import json
from datetime import datetime

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.valuation.db_starting_price_provider import DbStartingPriceProvider
from src.infrastructure.valuation.last_tick_provider import last_price_and_rating
from src.valuation.coefficients import DEFAULT_COEFFICIENTS, PricingCoefficients
from src.valuation.tournament import plan_qualification, qualified_team_ids

log = structlog.get_logger(__name__)

_QUALIFICATION_SOURCE = ValuationSource.QUALIFICATION.value


async def _knockout_team_pairs(session: AsyncSession, season_id: int) -> list[tuple[str, str]]:
    """(home, away) for every knockout fixture in the season — the source of the
    qualified set. A fixture is knockout when its stage label is not a group
    stage (our fixtures always carry real participants, never TBD placeholders)."""
    rows = await session.execute(
        text(
            "SELECT home_team_id, away_team_id FROM core.fixture "
            "WHERE season_id = :s AND stage_name IS NOT NULL "
            "AND lower(stage_name) NOT LIKE '%group%'"
        ),
        {"s": season_id},
    )
    return [(r.home_team_id, r.away_team_id) for r in rows.all()]


async def _already_qualified_teams(session: AsyncSession) -> set[str]:
    """Teams whose players already carry a qualification tick — skipped so the
    +5% is applied exactly once per team."""
    rows = await session.execute(
        text(
            "SELECT DISTINCT p.team_id FROM valuation.player_price_tick t "
            "JOIN core.player p ON p.id = t.player_id WHERE t.source = :src"
        ),
        {"src": _QUALIFICATION_SOURCE},
    )
    return {r.team_id for r in rows.all()}


async def _last_finished_fixture_by_team(
    session: AsyncSession, team_ids: set[str]
) -> dict[str, int]:
    """Each team's most recent FINISHED fixture id (its last group match). The
    qualification tick attaches here so it lands on a fixture, keeping the
    tournament-open anchor intact."""
    if not team_ids:
        return {}
    rows = await session.execute(
        text(
            """
            WITH team_fixtures AS (
                SELECT id AS fixture_id, home_team_id AS team_id, kickoff_at
                FROM core.fixture WHERE status = 'finished'
                UNION ALL
                SELECT id AS fixture_id, away_team_id AS team_id, kickoff_at
                FROM core.fixture WHERE status = 'finished'
            )
            SELECT DISTINCT ON (team_id) team_id, fixture_id
            FROM team_fixtures
            WHERE team_id = ANY(:teams)
            ORDER BY team_id, kickoff_at DESC
            """
        ),
        {"teams": list(team_ids)},
    )
    return {r.team_id: r.fixture_id for r in rows.all()}


async def apply_qualifications(
    session: AsyncSession,
    *,
    season_id: int,
    ts: datetime,
    coefficients: PricingCoefficients = DEFAULT_COEFFICIENTS,
) -> list[tuple[str, bytes]]:
    """Apply +5% to every player of every newly-qualified team. Returns
    per-player ``player_price_tick`` notifications; empty when no team qualifies
    for the first time this tick."""
    qualified = qualified_team_ids(await _knockout_team_pairs(session, season_id))
    if not qualified:
        return []
    to_reward = qualified - await _already_qualified_teams(session)
    if not to_reward:
        return []

    roster_rows = (
        await session.execute(select(PlayerORM.id, PlayerORM.team_id).where(PlayerORM.team_id.in_(to_reward)))
    ).all()
    roster = [(r.id, r.team_id) for r in roster_rows]
    player_ids = [pid for pid, _ in roster]
    team_by_player = dict(roster)

    base_by_player = await DbStartingPriceProvider(session).get_many(player_ids)
    last_price_by_player, rating_by_player = await last_price_and_rating(session, player_ids)
    fixture_by_team = await _last_finished_fixture_by_team(session, to_reward)

    ticks = plan_qualification(
        qualified=to_reward,
        roster=roster,
        base_by_player=base_by_player,
        last_price_by_player=last_price_by_player,
        rating_by_player=rating_by_player,
        coefficients=coefficients,
    )

    notifications: list[tuple[str, bytes]] = []
    for tick in ticks:
        fixture_id = fixture_by_team.get(team_by_player[tick.player_id])
        if fixture_id is None:
            # A qualified team with no finished fixture should not happen; skip
            # rather than write a NULL-fixture tick that would corrupt the anchor.
            continue
        await upsert_price_tick(
            session,
            player_id=tick.player_id,
            ts=ts,
            fixture_id=fixture_id,
            current_price=tick.price,
            performance_rating=tick.rating,
            source=_QUALIFICATION_SOURCE,
        )
        notifications.append(
            (
                f"fundxi.player_price_tick.{tick.player_id}",
                json.dumps(
                    {
                        "kind": "player_price_tick",
                        "player_id": tick.player_id,
                        "fixture_id": fixture_id,
                        "current_price": tick.price,
                    }
                ).encode(),
            )
        )

    log.info(
        "valuation.qualification.done",
        season_id=season_id,
        rewarded_teams=len(to_reward),
        settled_players=len(notifications),
    )
    return notifications
