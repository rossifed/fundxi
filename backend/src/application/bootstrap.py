"""Bootstrap orchestration — Application Services (Use Cases).

DDD roles:
- `bootstrap_teams` / `bootstrap_fixtures` / `bootstrap_squads` /
  `bootstrap_news` / `bootstrap_comments`: Application Services (small,
  composable, dependency-injected functions).
- `bootstrap_for_season`: Application Service orchestrating all of them.
- `BootstrapReport`: DTO returned to the caller (CLI).
- `RawEventArchive`: Port (Protocol). Defined inline — single consumer for now.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol

import structlog

from src.domain.match.fixture_repository import FixtureRepository
from src.domain.match.match_comment import MatchCommentRepository
from src.domain.news.news_repository import NewsRepository
from src.domain.player.player_repository import PlayerRepository
from src.domain.player.player_tournament_stat_repository import PlayerTournamentStatRepository
from src.domain.team.team_repository import TeamRepository
from src.infrastructure.sportmonks.client import SportmonksClient
from src.infrastructure.sportmonks.projectors.coach import CoachProjection, project_coach
from src.infrastructure.sportmonks.projectors.fixture import project_fixture
from src.infrastructure.sportmonks.projectors.match_comment import project_match_comment
from src.infrastructure.sportmonks.projectors.news import project_news
from src.infrastructure.sportmonks.projectors.player import project_player
from src.infrastructure.sportmonks.projectors.player_stat import project_player_stat
from src.infrastructure.sportmonks.projectors.team import project_team

log = structlog.get_logger(__name__)


class RawEventArchive(Protocol):
    async def insert_if_new(
        self,
        *,
        endpoint: str,
        params: dict[str, Any],
        response: dict[str, Any],
    ) -> bool: ...


class CoachRepository(Protocol):
    """Port — upsert a coach projection, return its internal id. Defined
    inline (single consumer: bootstrap_teams), like RawEventArchive."""

    async def upsert(self, projection: CoachProjection) -> int: ...


@dataclass(frozen=True, slots=True)
class BootstrapReport:
    teams: int
    fixtures: int
    players: int
    news: int = 0
    comments: int = 0
    player_stats: int = 0


async def _paginate_pages(
    client: SportmonksClient,
    endpoint: str,
    *,
    base_params: dict[str, Any] | None = None,
) -> AsyncIterator[tuple[dict[str, Any], dict[str, Any]]]:
    """Yield (params, envelope) for each page until pagination.has_more is False."""
    page = 1
    while True:
        params: dict[str, Any] = {**(base_params or {}), "page": page}
        envelope = await client.get(endpoint, params=params)
        yield params, envelope
        pagination = envelope.get("pagination")
        has_more = isinstance(pagination, dict) and bool(pagination.get("has_more"))
        if not has_more:
            break
        page += 1


def _data_items(envelope: dict[str, Any]) -> list[dict[str, Any]]:
    data = envelope.get("data")
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _head_coach(coaches: Any) -> dict[str, Any] | None:
    """Extract the head coach entity from a team's ``coaches`` pivot list
    (``include=coaches.coach.country``). Each element is a team↔coach
    pivot; we prefer the ``active`` link and return its nested ``coach``
    object. Returns None when there is no usable coach."""
    if not isinstance(coaches, list):
        return None
    pivots = [p for p in coaches if isinstance(p, dict)]
    if not pivots:
        return None
    active = [p for p in pivots if p.get("active") is True]
    chosen = active[0] if active else pivots[0]
    coach = chosen.get("coach")
    return coach if isinstance(coach, dict) else None


async def bootstrap_teams(
    *,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    team_repo: TeamRepository,
    coach_repo: CoachRepository,
    season_id: int,
) -> list[tuple[int, str]]:
    """Fetch + upsert teams for the season. Returns (sportmonks_id, internal_id) pairs.

    ``include=coaches.coach.country`` rides along so each team is linked to
    its head coach (core.coach) within the same call."""
    endpoint = f"/teams/seasons/{season_id}"
    base_params = {"include": "coaches.coach.country;country.continent"}
    pairs: list[tuple[int, str]] = []
    skipped = 0
    coaches_linked = 0
    async for params, envelope in _paginate_pages(client, endpoint, base_params=base_params):
        await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)
        for item in _data_items(envelope):
            # Future tournaments expose TBD bracket slots flagged by
            # Sportmonks' own ``placeholder: true`` (no short_code, e.g.
            # "Winner Quarter-final 1"). Not real teams — skip them
            # (provider's own flag, not our invention). They turn real
            # on later bootstrap re-runs as qualification resolves.
            if item.get("placeholder") is True:
                skipped += 1
                continue
            try:
                team, sportmonks_id = project_team(item)
            except (ValueError, TypeError) as exc:
                log.debug("bootstrap.teams.skip", reason=str(exc))
                skipped += 1
                continue
            # Head coach — optional. We pick the active team↔coach link
            # and project its nested coach entity; an absent or
            # unprojectable coach just leaves the team unlinked.
            coach_id: int | None = None
            coach_projection = project_coach(_head_coach(item.get("coaches")))
            if coach_projection is not None:
                coach_id = await coach_repo.upsert(coach_projection)
                coaches_linked += 1
            await team_repo.upsert(team, sportmonks_id=sportmonks_id, coach_id=coach_id)
            pairs.append((sportmonks_id, team.id))
    log.info(
        "bootstrap.teams.done",
        count=len(pairs),
        skipped=skipped,
        coaches=coaches_linked,
        season_id=season_id,
    )
    return pairs


async def bootstrap_fixtures(
    *,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    fixture_repo: FixtureRepository,
    season_id: int,
) -> int:
    # Sportmonks v3 has no /fixtures/seasons/{id} path; we filter the global
    # /fixtures endpoint by season instead. Confirmed against the real API.
    endpoint = "/fixtures"
    base_params = {
        "filters": f"fixtureSeasons:{season_id}",
        "include": "participants;state;scores",
    }
    count = 0
    skipped = 0
    async for params, envelope in _paginate_pages(client, endpoint, base_params=base_params):
        await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)
        for item in _data_items(envelope):
            # Group A..L is not natively in /fixtures; enrichment overlay applied later.
            # Knockout fixtures of a future tournament have TBD placeholder
            # participants (no short_code) until qualification resolves —
            # unprojectable, skip them. Real group-stage fixtures (qualified
            # nations) project fine. Idempotent re-runs fill knockouts later.
            try:
                fixture, sportmonks_id = project_fixture(item, group="")
            except (ValueError, TypeError) as exc:
                log.debug("bootstrap.fixtures.skip", reason=str(exc))
                skipped += 1
                continue
            await fixture_repo.upsert_by_sportmonks_id(fixture, sportmonks_id=sportmonks_id)
            count += 1
    log.info("bootstrap.fixtures.done", count=count, skipped=skipped, season_id=season_id)
    return count


async def bootstrap_squads(
    *,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    player_repo: PlayerRepository,
    teams: list[tuple[int, str]],
    season_id: int,
    today: date,
) -> int:
    base_params = {"include": "player.position;player.detailedPosition;player.nationality;player.city;player.metadata"}
    count = 0
    skipped = 0
    for sportmonks_team_id, internal_team_id in teams:
        endpoint = f"/squads/seasons/{season_id}/teams/{sportmonks_team_id}"
        async for params, envelope in _paginate_pages(client, endpoint, base_params=base_params):
            await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)
            for squad_entry in _data_items(envelope):
                # Sportmonks ``/squads/seasons/{s}/teams/{t}`` returns every
                # player registered for the team across the whole season
                # (incl. pre-tournament call-ups). The active final-tournament
                # squad is the subset where ``has_values=true`` — that's the
                # 26-man (FIFA 2022) or 23-man (FIFA 2018) roster.
                if squad_entry.get("has_values") is not True:
                    skipped += 1
                    continue
                jersey = squad_entry.get("jersey_number")
                if not isinstance(jersey, int):
                    skipped += 1
                    continue
                player_payload = squad_entry.get("player")
                if not isinstance(player_payload, dict):
                    skipped += 1
                    continue
                squad_position_id = squad_entry.get("position_id")
                try:
                    player, sportmonks_id = project_player(
                        player_payload,
                        team_id=internal_team_id,
                        jersey_number=jersey,
                        today=today,
                        fallback_position_id=squad_position_id if isinstance(squad_position_id, int) else None,
                    )
                except (ValueError, TypeError) as exc:
                    log.warning(
                        "bootstrap.squads.skip",
                        team_id=internal_team_id,
                        sportmonks_player_id=player_payload.get("id"),
                        reason=str(exc),
                    )
                    skipped += 1
                    continue
                await player_repo.upsert_by_sportmonks_id(player, sportmonks_id=sportmonks_id)
                count += 1
    log.info("bootstrap.squads.done", count=count, skipped=skipped, season_id=season_id)
    return count


async def bootstrap_player_stats(
    *,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    player_repo: PlayerRepository,
    stat_repo: PlayerTournamentStatRepository,
    teams: list[tuple[int, str]],
    season_id: int,
) -> int:
    """Per-team squad fetch with player.statistics include — efficient (one
    call per team covers all its players + their stats). Filters down to the
    target season_id at projection time so we don't accidentally store
    historical seasons.

    Resolves Sportmonks player_id → internal core.player.id via the player
    repo's mapping table; squad entries we can't resolve (player not yet
    ingested) are skipped — re-running bootstrap then re-running this stage
    closes the gap.
    """
    base_params = {"include": "player.statistics.details"}
    sportmonks_to_internal = await player_repo.map_sportmonks_to_internal_id()
    count = 0
    skipped = 0
    for sportmonks_team_id, _internal_team_id in teams:
        endpoint = f"/squads/seasons/{season_id}/teams/{sportmonks_team_id}"
        async for params, envelope in _paginate_pages(client, endpoint, base_params=base_params):
            await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)
            for squad_entry in _data_items(envelope):
                # Match the bootstrap_squads filter: only the active final
                # tournament squad (has_values=true). Otherwise we'd materialise
                # player_tournament_stat rows for pre-tournament call-ups that
                # never played the final tournament.
                if squad_entry.get("has_values") is not True:
                    skipped += 1
                    continue
                player_payload = squad_entry.get("player")
                if not isinstance(player_payload, dict):
                    skipped += 1
                    continue
                sportmonks_player_id = player_payload.get("id")
                if not isinstance(sportmonks_player_id, int):
                    skipped += 1
                    continue
                internal_player_id = sportmonks_to_internal.get(sportmonks_player_id)
                if internal_player_id is None:
                    skipped += 1
                    continue
                blocks = player_payload.get("statistics") or []
                if not isinstance(blocks, list):
                    continue
                for block in blocks:
                    if not isinstance(block, dict):
                        continue
                    if block.get("season_id") != season_id:
                        continue
                    try:
                        stat, smk_stat_id, raw = project_player_stat(block, internal_player_id=internal_player_id)
                    except (ValueError, TypeError) as exc:
                        log.warning(
                            "bootstrap.player_stats.skip",
                            sportmonks_player_id=sportmonks_player_id,
                            reason=str(exc),
                        )
                        skipped += 1
                        continue
                    await stat_repo.upsert_by_sportmonks_id(stat, sportmonks_statistic_id=smk_stat_id, raw_stats=raw)
                    count += 1
    log.info("bootstrap.player_stats.done", count=count, skipped=skipped, season_id=season_id)
    return count


async def bootstrap_news(
    *,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    news_repo: NewsRepository,
    fixture_repo: FixtureRepository,
    season_id: int,
) -> int:
    """Ingest pre-match AND post-match news for the season. Resolves the
    sportmonks fixture_id back to our internal core.fixture.id at projection."""
    fixture_id_by_smk = await fixture_repo.map_sportmonks_to_internal_id()
    count = 0
    for endpoint in (f"/news/pre-match/seasons/{season_id}", f"/news/post-match/seasons/{season_id}"):
        async for params, envelope in _paginate_pages(client, endpoint):
            await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)
            for item in _data_items(envelope):
                try:
                    news, sportmonks_id, smk_fixture_id = project_news(item)
                except (ValueError, TypeError) as exc:
                    log.warning("bootstrap.news.skip", reason=str(exc))
                    continue
                # Resolve fixture link if the news ties to one we know.
                resolved_fixture_id: int | None = None
                if smk_fixture_id is not None:
                    resolved_fixture_id = fixture_id_by_smk.get(smk_fixture_id)
                # The dataclass is frozen; rebuild with the resolved link.
                from dataclasses import replace

                news_with_link = replace(news, fixture_id=resolved_fixture_id)
                await news_repo.upsert_by_sportmonks_id(news_with_link, sportmonks_id=sportmonks_id)
                count += 1
    log.info("bootstrap.news.done", count=count, season_id=season_id)
    return count


async def bootstrap_comments(
    *,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    comment_repo: MatchCommentRepository,
    fixture_repo: FixtureRepository,
) -> int:
    """For each fixture in core.*, fetch /fixtures/{id}?include=comments and
    upsert all per-minute commentaries. ~1 call per fixture."""
    fixture_id_by_smk = await fixture_repo.map_sportmonks_to_internal_id()
    count = 0
    for smk_fixture_id, internal_fixture_id in fixture_id_by_smk.items():
        endpoint = f"/fixtures/{smk_fixture_id}"
        params = {"include": "comments"}
        envelope = await client.get(endpoint, params=params)
        await raw_archive.insert_if_new(endpoint=endpoint, params=params, response=envelope)
        data = envelope.get("data") or {}
        if not isinstance(data, dict):
            continue
        comments_payload = data.get("comments") or []
        if not isinstance(comments_payload, list):
            continue
        for comment_item in comments_payload:
            if not isinstance(comment_item, dict):
                continue
            try:
                comment, sportmonks_id = project_match_comment(comment_item, fixture_id=internal_fixture_id)
            except (ValueError, TypeError) as exc:
                log.warning("bootstrap.comments.skip", reason=str(exc))
                continue
            await comment_repo.upsert_by_sportmonks_id(comment, sportmonks_id=sportmonks_id)
            count += 1
    log.info("bootstrap.comments.done", count=count, fixtures=len(fixture_id_by_smk))
    return count


async def bootstrap_for_season(
    *,
    client: SportmonksClient,
    raw_archive: RawEventArchive,
    team_repo: TeamRepository,
    coach_repo: CoachRepository,
    fixture_repo: FixtureRepository,
    player_repo: PlayerRepository,
    stat_repo: PlayerTournamentStatRepository,
    news_repo: NewsRepository,
    comment_repo: MatchCommentRepository,
    season_id: int,
    today: date,
) -> BootstrapReport:
    teams = await bootstrap_teams(
        client=client,
        raw_archive=raw_archive,
        team_repo=team_repo,
        coach_repo=coach_repo,
        season_id=season_id,
    )
    fixtures = await bootstrap_fixtures(
        client=client, raw_archive=raw_archive, fixture_repo=fixture_repo, season_id=season_id
    )
    players = await bootstrap_squads(
        client=client,
        raw_archive=raw_archive,
        player_repo=player_repo,
        teams=teams,
        season_id=season_id,
        today=today,
    )
    player_stats = await bootstrap_player_stats(
        client=client,
        raw_archive=raw_archive,
        player_repo=player_repo,
        stat_repo=stat_repo,
        teams=teams,
        season_id=season_id,
    )
    news = await bootstrap_news(
        client=client,
        raw_archive=raw_archive,
        news_repo=news_repo,
        fixture_repo=fixture_repo,
        season_id=season_id,
    )
    comments = await bootstrap_comments(
        client=client,
        raw_archive=raw_archive,
        comment_repo=comment_repo,
        fixture_repo=fixture_repo,
    )
    return BootstrapReport(
        teams=len(teams),
        fixtures=fixtures,
        players=players,
        news=news,
        comments=comments,
        player_stats=player_stats,
    )
