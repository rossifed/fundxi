"""get_match — Application Service composing fixture + lineups + events
   + valuation deltas into a single Match aggregate for the frontend.

DDD role: Application Service. Pure orchestration: reads via repositories,
no I/O of its own. Called by the /api/fixtures/{id}/match route.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.fixture import Fixture, FixtureStatus
from src.domain.match.lineup import Lineup, LineupRole
from src.domain.match.match_event import MatchEvent, MatchEventType
from src.domain.player.player import Player, Position
from src.domain.valuation.player_valuation import PlayerValuation
from src.domain.valuation.valuation_provider import ValuationProvider
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.lineup import LineupORM
from src.infrastructure.db.models.match_event import MatchEventORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.standings import StandingORM
from src.infrastructure.db.models.venue import VenueORM


def _fixture_orm_to_domain(
    orm: FixtureORM,
    *,
    group_override: str | None = None,
    venue_name: str | None = None,
) -> Fixture:
    return Fixture(
        id=orm.id,
        home_team_id=orm.home_team_id,
        away_team_id=orm.away_team_id,
        status=FixtureStatus(orm.status),
        group=group_override if group_override is not None else orm.group,
        home_score=orm.home_score,
        away_score=orm.away_score,
        kickoff_at=orm.kickoff_at,
        minute=orm.minute,
        note=orm.note,
        home_kit_color=orm.home_kit_color,
        away_kit_color=orm.away_kit_color,
        home_kit_palette=orm.home_kit_palette,
        away_kit_palette=orm.away_kit_palette,
        home_formation=orm.home_formation,
        away_formation=orm.away_formation,
        venue_name=venue_name,
        stage_name=orm.stage_name,
        round_name=orm.round_name,
    )


def _player_orm_to_domain(orm: PlayerORM) -> Player:
    return Player(
        id=orm.id,
        name=orm.name,
        jersey_number=orm.jersey_number,
        team_id=orm.team_id,
        position=Position(orm.position),
        full_name=orm.full_name,
        age=orm.age,
        foot=orm.foot,
        height=orm.height,
        weight=orm.weight,
        club=orm.club,
        bio=orm.bio,
    )


# Squad-fallback ordering: group by position (GK → DF → MF → FW), then within a
# group by base value (stars first — a real-data proxy for the likely starters,
# NOT a predicted XI), then jersey.
_SQUAD_POSITION_ORDER = {
    Position.GOALKEEPER: 0,
    Position.DEFENDER: 1,
    Position.MIDFIELDER: 2,
    Position.FORWARD: 3,
}


@dataclass(frozen=True, slots=True)
class MatchPlayerView:
    player: Player
    valuation: PlayerValuation
    # The lineup row placing the player in the XI/bench. None for a squad-fallback
    # view (lineup not published yet) — jersey/team then come from the player.
    lineup: Lineup | None


@dataclass(frozen=True, slots=True)
class MatchView:
    fixture: Fixture
    # True when real lineups are published. False before kickoff when no XI is
    # out yet: home/away_squad then carry the full squads (xi/bench stay empty).
    lineup_published: bool
    home_xi: list[MatchPlayerView]
    away_xi: list[MatchPlayerView]
    home_bench: list[MatchPlayerView]
    away_bench: list[MatchPlayerView]
    # Full squads — populated ONLY when lineup_published is False.
    home_squad: list[MatchPlayerView]
    away_squad: list[MatchPlayerView]
    events: list[MatchEvent]
    player_names: dict[int, str]


def _orm_lineup_to_domain(orm: LineupORM) -> Lineup:
    return Lineup(
        id=orm.id,
        fixture_id=orm.fixture_id,
        player_id=orm.player_id,
        team_id=orm.team_id,
        role=LineupRole(orm.role),
        position=orm.position,
        jersey_number=orm.jersey_number,
        formation_position=orm.formation_position,
        formation_field=orm.formation_field,
    )


def _orm_event_to_domain(orm: MatchEventORM) -> MatchEvent:
    return MatchEvent(
        id=orm.id,
        fixture_id=orm.fixture_id,
        minute=orm.minute,
        extra_minute=orm.extra_minute,
        type=MatchEventType(orm.type),
        player_id=orm.player_id,
        related_player_id=orm.related_player_id,
        team_id=orm.team_id,
        info=orm.info,
        sequence=orm.sequence,
    )


async def get_match_view(
    *,
    session: AsyncSession,
    valuation_provider: ValuationProvider,
    fixture_id: int,
) -> MatchView | None:
    fx_row = await session.execute(select(FixtureORM).where(FixtureORM.id == fixture_id))
    fx_orm = fx_row.scalar_one_or_none()
    if fx_orm is None:
        return None

    # Same-group test: a fixture is a group-stage match iff both teams sit in
    # the same group. Knockout fixtures cross groups → group stays empty.
    grp_rows = await session.execute(
        select(StandingORM.team_id, StandingORM.group).where(
            StandingORM.team_id.in_((fx_orm.home_team_id, fx_orm.away_team_id))
        )
    )
    grp_by_team = {team_id: grp for team_id, grp in grp_rows.all()}
    home_grp = grp_by_team.get(fx_orm.home_team_id)
    away_grp = grp_by_team.get(fx_orm.away_team_id)
    group_letter = home_grp if home_grp is not None and home_grp == away_grp else None

    venue_name: str | None = None
    if fx_orm.venue_id is not None:
        venue_row = await session.execute(select(VenueORM.name).where(VenueORM.id == fx_orm.venue_id))
        venue_name = venue_row.scalar_one_or_none()

    fixture = _fixture_orm_to_domain(fx_orm, group_override=group_letter, venue_name=venue_name)

    # Lineups (separate by role + team).
    lineups_rows = (await session.execute(select(LineupORM).where(LineupORM.fixture_id == fixture_id))).scalars().all()
    lineups = [_orm_lineup_to_domain(o) for o in lineups_rows]
    lineup_published = len(lineups) > 0

    # Squad fallback: before the XI is published the fixture would be empty —
    # useless when the user opens a match to position ahead of kickoff. While no
    # lineup exists, the "players in this fixture" are both teams' full squads
    # (the canonical 26-man set kept in core.player). Loaded ONLY then; once a
    # lineup exists we trust it and drop the fallback.
    squad_orms: list[PlayerORM] = []
    if not lineup_published:
        squad_orms = list(
            (
                await session.execute(
                    select(PlayerORM).where(PlayerORM.team_id.in_((fx_orm.home_team_id, fx_orm.away_team_id)))
                )
            )
            .scalars()
            .all()
        )

    # All players appearing in this fixture (lineups + events + squad fallback).
    player_ids: set[int] = {ln.player_id for ln in lineups}
    player_ids.update(o.id for o in squad_orms)
    events_rows = (
        (
            await session.execute(
                # Chronological order: `sequence` mirrors Sportmonks `sort_order`,
                # which is a PER-TYPE counter (nth sub, nth card), not a global
                # timeline — ordering by it scrambles the feed. minute (+ stoppage)
                # is the timeline; sportmonks_id is monotonic within a minute.
                select(MatchEventORM)
                .where(MatchEventORM.fixture_id == fixture_id)
                .order_by(
                    MatchEventORM.minute, MatchEventORM.extra_minute.nulls_first(), MatchEventORM.sportmonks_id
                )
            )
        )
        .scalars()
        .all()
    )
    events = [_orm_event_to_domain(o) for o in events_rows]
    for ev in events:
        if ev.player_id is not None:
            player_ids.add(ev.player_id)
        if ev.related_player_id is not None:
            player_ids.add(ev.related_player_id)

    # Bulk-load player domain objects.
    player_orms = (
        (await session.execute(select(PlayerORM).where(PlayerORM.id.in_(player_ids)))).scalars().all()
        if player_ids
        else []
    )
    player_by_id: dict[int, Player] = {p.id: _player_orm_to_domain(p) for p in player_orms}
    player_names: dict[int, str] = {p.id: p.name for p in player_orms}

    # Bulk valuations.
    valuations: dict[int, PlayerValuation] = (
        await valuation_provider.get_for_players(list(player_ids)) if player_ids else {}
    )

    def _make_view(line: Lineup) -> MatchPlayerView | None:
        p = player_by_id.get(line.player_id)
        v = valuations.get(line.player_id)
        if p is None or v is None:
            return None
        return MatchPlayerView(player=p, valuation=v, lineup=line)

    home_xi: list[MatchPlayerView] = []
    away_xi: list[MatchPlayerView] = []
    home_bench: list[MatchPlayerView] = []
    away_bench: list[MatchPlayerView] = []
    for ln in lineups:
        view = _make_view(ln)
        if view is None:
            continue
        is_home = ln.team_id == fixture.home_team_id
        is_starter = ln.role is LineupRole.STARTER
        if is_home and is_starter:
            home_xi.append(view)
        elif is_home:
            home_bench.append(view)
        elif is_starter:
            away_xi.append(view)
        else:
            away_bench.append(view)

    home_xi.sort(key=lambda v: (v.lineup.formation_position if v.lineup else None) or 99)
    away_xi.sort(key=lambda v: (v.lineup.formation_position if v.lineup else None) or 99)
    home_bench.sort(key=lambda v: (v.lineup.jersey_number if v.lineup else None) or 99)
    away_bench.sort(key=lambda v: (v.lineup.jersey_number if v.lineup else None) or 99)

    # Squad fallback views (only when no lineup is published). Ordered by the
    # position group then base value (stars first) — see _SQUAD_POSITION_ORDER.
    home_squad: list[MatchPlayerView] = []
    away_squad: list[MatchPlayerView] = []
    if not lineup_published:
        ordered = sorted(
            squad_orms,
            key=lambda o: (
                _SQUAD_POSITION_ORDER.get(Position(o.position), 9),
                -float(o.base_value) if o.base_value is not None else float("inf"),
                o.jersey_number or 99,
            ),
        )
        for so in ordered:
            p = player_by_id.get(so.id)
            v = valuations.get(so.id)
            if p is None or v is None:
                continue
            sview = MatchPlayerView(player=p, valuation=v, lineup=None)
            (home_squad if so.team_id == fixture.home_team_id else away_squad).append(sview)

    # Per-player match move is carried on each MatchPlayerView.valuation
    # (change_last_match, from the single price-based read-model) — no separate
    # raw-tick map.
    return MatchView(
        fixture=fixture,
        lineup_published=lineup_published,
        home_xi=home_xi,
        away_xi=away_xi,
        home_bench=home_bench,
        away_bench=away_bench,
        home_squad=home_squad,
        away_squad=away_squad,
        events=events,
        player_names=player_names,
    )
