"""Unit tests for the bootstrap Application Service.

Strategy: feed the use case with fake adapters (in-memory) so we test
orchestration logic — pagination, raw archiving, projection, upsert ordering —
without a real DB or HTTP traffic.
"""

from datetime import date
from typing import Any

import pytest

from src.application.bootstrap import (
    bootstrap_fixtures,
    bootstrap_for_season,
    bootstrap_squads,
    bootstrap_teams,
)
from src.domain.match.fixture import Fixture
from src.domain.match.match_comment import MatchComment
from src.domain.news.news import News
from src.domain.player.player import Player
from src.domain.team.team import Team
from src.infrastructure.sportmonks.projectors.coach import CoachProjection

# --- Fakes ----------------------------------------------------------------


class _FakeClient:
    """Stub SportmonksClient: returns canned envelopes per (endpoint, page)."""

    def __init__(self, pages: dict[str, list[dict[str, Any]]]) -> None:
        self._pages = pages
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def get(self, endpoint: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        actual_params = dict(params or {})
        self.calls.append((endpoint, actual_params))
        page_no = int(actual_params.get("page", 1))
        endpoint_pages = self._pages.get(endpoint, [])
        if 1 <= page_no <= len(endpoint_pages):
            return endpoint_pages[page_no - 1]
        return {"data": [], "pagination": {"has_more": False}}


class _FakeRawArchive:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any], dict[str, Any]]] = []

    async def insert_if_new(
        self,
        *,
        endpoint: str,
        params: dict[str, Any],
        response: dict[str, Any],
    ) -> bool:
        self.events.append((endpoint, params, response))
        return True


class _FakeTeamRepo:
    """Implements TeamRepository structurally. Read methods are stubs (these
    bootstrap tests only exercise upsert)."""

    def __init__(self) -> None:
        self.upserts: list[tuple[Team, int | None]] = []
        self.coach_links: list[int | None] = []

    async def upsert(
        self, team: Team, *, sportmonks_id: int | None = None, coach_id: int | None = None
    ) -> None:
        self.upserts.append((team, sportmonks_id))
        self.coach_links.append(coach_id)

    async def list_all(self) -> list[Team]:
        raise NotImplementedError

    async def get_by_id(self, team_id: str) -> Team | None:
        raise NotImplementedError


class _FakeCoachRepo:
    """Implements the bootstrap CoachRepository port structurally."""

    def __init__(self) -> None:
        self.upserts: list[CoachProjection] = []

    async def upsert(self, projection: CoachProjection) -> int:
        self.upserts.append(projection)
        return len(self.upserts)


class _FakePlayerRepo:
    def __init__(self) -> None:
        self.upserts: list[tuple[Player, int]] = []

    async def upsert_by_sportmonks_id(self, player: Player, *, sportmonks_id: int) -> None:
        self.upserts.append((player, sportmonks_id))

    async def list_all(self) -> list[Player]:
        raise NotImplementedError

    async def get_by_id(self, player_id: int) -> Player | None:
        raise NotImplementedError

    async def search(self, criteria: object) -> list[Player]:
        raise NotImplementedError

    async def map_sportmonks_to_internal_id(self) -> dict[int, int]:
        return {}


class _FakeStatRepo:
    def __init__(self) -> None:
        self.upserts: list[tuple[object, int]] = []

    async def upsert_by_sportmonks_id(self, stat: object, *, sportmonks_statistic_id: int, raw_stats: object) -> None:
        self.upserts.append((stat, sportmonks_statistic_id))


class _FakeFixtureRepo:
    def __init__(self) -> None:
        self.upserts: list[tuple[Fixture, int]] = []
        self._fixture_id_map: dict[int, int] = {}

    async def upsert_by_sportmonks_id(self, fixture: Fixture, *, sportmonks_id: int) -> None:
        self.upserts.append((fixture, sportmonks_id))
        # Synthetic id for testing news/comment fixture resolution.
        self._fixture_id_map[sportmonks_id] = len(self.upserts)

    async def list_all(self, *, season_id: int | None = None) -> list[Fixture]:
        raise NotImplementedError

    async def get_by_id(self, fixture_id: int) -> Fixture | None:
        raise NotImplementedError

    async def list_by_status(self, status: object, *, season_id: int | None = None) -> list[Fixture]:
        raise NotImplementedError

    async def map_sportmonks_to_internal_id(self) -> dict[int, int]:
        return dict(self._fixture_id_map)

    async def set_kit_colors(
        self,
        *,
        sportmonks_id: int,
        home_kit_color: str | None,
        away_kit_color: str | None,
        home_kit_palette: str | None,
        away_kit_palette: str | None,
    ) -> None:
        _ = (sportmonks_id, home_kit_color, away_kit_color, home_kit_palette, away_kit_palette)

    async def set_formations(
        self,
        *,
        sportmonks_id: int,
        home_formation: str | None,
        away_formation: str | None,
    ) -> None:
        _ = (sportmonks_id, home_formation, away_formation)

    async def set_venue_and_phase(
        self,
        *,
        sportmonks_id: int,
        venue_id: int | None,
        stage_name: str | None,
        round_name: str | None,
    ) -> None:
        _ = (sportmonks_id, venue_id, stage_name, round_name)

    async def set_phase(
        self,
        *,
        sportmonks_id: int,
        stage_name: str | None,
        round_name: str | None,
    ) -> None:
        _ = (sportmonks_id, stage_name, round_name)


class _FakeNewsRepo:
    def __init__(self) -> None:
        self.upserts: list[tuple[News, int]] = []

    async def upsert_by_sportmonks_id(self, news: News, *, sportmonks_id: int) -> None:
        self.upserts.append((news, sportmonks_id))

    async def list_recent(self, *, limit: int = 20) -> list[News]:
        raise NotImplementedError

    async def list_by_fixture(self, fixture_id: int) -> list[News]:
        raise NotImplementedError

    async def list_by_team(self, team_id: str, *, limit: int = 50) -> list[News]:
        raise NotImplementedError


class _FakeMatchCommentRepo:
    def __init__(self) -> None:
        self.upserts: list[tuple[MatchComment, int]] = []

    async def upsert_by_sportmonks_id(self, comment: MatchComment, *, sportmonks_id: int) -> None:
        self.upserts.append((comment, sportmonks_id))

    async def list_by_fixture(self, fixture_id: int) -> list[MatchComment]:
        raise NotImplementedError

    async def list_by_team(self, team_id: str, *, limit: int = 100) -> list[MatchComment]:
        raise NotImplementedError

    async def list_by_player(self, player_id: int, *, limit: int = 100) -> list[MatchComment]:
        raise NotImplementedError


# --- Tests -----------------------------------------------------------------


@pytest.mark.anyio
async def test_bootstrap_teams_single_page() -> None:
    client = _FakeClient(
        {
            "/teams/seasons/100": [
                {
                    "data": [
                        {"id": 17, "name": "Brazil", "short_code": "BRA", "type": "national"},
                        {"id": 18, "name": "France", "short_code": "FRA", "type": "national"},
                    ],
                    "pagination": {"has_more": False},
                }
            ]
        }
    )
    raw_archive = _FakeRawArchive()
    team_repo = _FakeTeamRepo()

    pairs = await bootstrap_teams(
        client=client,
        raw_archive=raw_archive,
        team_repo=team_repo,
        coach_repo=_FakeCoachRepo(),
        season_id=100,
    )

    assert pairs == [(17, "BRA"), (18, "FRA")]
    assert len(raw_archive.events) == 1
    assert len(team_repo.upserts) == 2
    assert team_repo.upserts[0][0].name == "Brazil"
    assert team_repo.upserts[0][1] == 17


@pytest.mark.anyio
async def test_bootstrap_teams_paginates() -> None:
    client = _FakeClient(
        {
            "/teams/seasons/100": [
                {
                    "data": [{"id": 1, "name": "A", "short_code": "AAA", "type": "national"}],
                    "pagination": {"has_more": True},
                },
                {
                    "data": [{"id": 2, "name": "B", "short_code": "BBB", "type": "national"}],
                    "pagination": {"has_more": False},
                },
            ]
        }
    )
    raw_archive = _FakeRawArchive()
    team_repo = _FakeTeamRepo()

    pairs = await bootstrap_teams(
        client=client,
        raw_archive=raw_archive,
        team_repo=team_repo,
        coach_repo=_FakeCoachRepo(),
        season_id=100,
    )

    assert pairs == [(1, "AAA"), (2, "BBB")]
    assert len(raw_archive.events) == 2  # one per page
    assert client.calls == [
        ("/teams/seasons/100", {"include": "coaches.coach.country;country.continent", "page": 1}),
        ("/teams/seasons/100", {"include": "coaches.coach.country;country.continent", "page": 2}),
    ]


@pytest.mark.anyio
async def test_bootstrap_teams_links_head_coach() -> None:
    client = _FakeClient(
        {
            "/teams/seasons/100": [
                {
                    "data": [
                        {
                            "id": 17,
                            "name": "Japan",
                            "short_code": "JPN",
                            "type": "national",
                            "coaches": [
                                {
                                    "active": True,
                                    "coach": {
                                        "id": 471484,
                                        "name": "Hajime Moriyasu",
                                        "image_path": "https://cdn.sportmonks.com/x.png",
                                        "country": {"name": "Japan", "iso2": "JP"},
                                    },
                                }
                            ],
                        },
                        # No coaches include -> team still ingests, unlinked.
                        {"id": 18, "name": "France", "short_code": "FRA", "type": "national"},
                    ],
                    "pagination": {"has_more": False},
                }
            ]
        }
    )
    raw_archive = _FakeRawArchive()
    team_repo = _FakeTeamRepo()
    coach_repo = _FakeCoachRepo()

    pairs = await bootstrap_teams(
        client=client,
        raw_archive=raw_archive,
        team_repo=team_repo,
        coach_repo=coach_repo,
        season_id=100,
    )

    assert pairs == [(17, "JPN"), (18, "FRA")]
    assert len(coach_repo.upserts) == 1
    assert coach_repo.upserts[0].name == "Hajime Moriyasu"
    assert coach_repo.upserts[0].nationality_name == "Japan"
    assert coach_repo.upserts[0].nationality_iso == "JP"
    # Japan linked to the coach (fake repo returns id 1); France unlinked.
    assert team_repo.coach_links == [1, None]


@pytest.mark.anyio
async def test_bootstrap_fixtures_passes_includes() -> None:
    client = _FakeClient(
        {
            "/fixtures": [
                {
                    "data": [
                        {
                            "id": 9001,
                            "starting_at": "2026-06-12 20:00:00",
                            "state": {"state": "NS"},
                            "participants": [
                                {"short_code": "FRA", "meta": {"location": "home"}},
                                {"short_code": "BRA", "meta": {"location": "away"}},
                            ],
                        }
                    ],
                    "pagination": {"has_more": False},
                }
            ]
        }
    )
    raw_archive = _FakeRawArchive()
    fixture_repo = _FakeFixtureRepo()

    count = await bootstrap_fixtures(
        client=client,
        raw_archive=raw_archive,
        fixture_repo=fixture_repo,
        season_id=100,
    )

    assert count == 1
    assert client.calls[0][1] == {
        "filters": "fixtureSeasons:100",
        "include": "participants;state;scores",
        "page": 1,
    }
    fixture, sportmonks_id = fixture_repo.upserts[0]
    assert sportmonks_id == 9001
    assert fixture.home_team_id == "FRA"
    assert fixture.away_team_id == "BRA"


@pytest.mark.anyio
async def test_bootstrap_squads_iterates_teams() -> None:
    client = _FakeClient(
        {
            "/squads/seasons/100/teams/17": [
                {
                    "data": [
                        {
                            "has_values": True,
                            "jersey_number": 10,
                            "player": {
                                "id": 200,
                                "common_name": "Pelé",
                                "display_name": "Pelé",
                                "name": "Edson Arantes do Nascimento",
                                "date_of_birth": "1940-10-23",
                                "position": {"id": 27, "name": "Attacker"},
                            },
                        },
                    ],
                    "pagination": {"has_more": False},
                }
            ],
            "/squads/seasons/100/teams/18": [
                {
                    "data": [
                        {
                            "has_values": True,
                            "jersey_number": 7,
                            "player": {
                                "id": 201,
                                "common_name": "Zidane",
                                "display_name": "Zidane",
                                "name": "Zinedine Zidane",
                                "date_of_birth": "1972-06-23",
                                "position": {"id": 26, "name": "Midfielder"},
                            },
                        },
                    ],
                    "pagination": {"has_more": False},
                }
            ],
        }
    )
    raw_archive = _FakeRawArchive()
    player_repo = _FakePlayerRepo()

    count = await bootstrap_squads(
        client=client,
        raw_archive=raw_archive,
        player_repo=player_repo,
        teams=[(17, "BRA"), (18, "FRA")],
        season_id=100,
        today=date(2026, 6, 1),
    )

    assert count == 2
    assert {p.team_id for p, _ in player_repo.upserts} == {"BRA", "FRA"}
    assert {p.jersey_number for p, _ in player_repo.upserts} == {10, 7}


@pytest.mark.anyio
async def test_bootstrap_squads_skips_malformed_entries() -> None:
    client = _FakeClient(
        {
            "/squads/seasons/100/teams/17": [
                {
                    "data": [
                        {"has_values": True, "jersey_number": "not-an-int", "player": {"id": 1}},  # bad jersey
                        {"has_values": True, "player": {"id": 2}},  # missing jersey
                        {"has_values": True, "jersey_number": 10},  # missing player
                        # non-active squad entry (pre-tournament call-up etc.) — must be skipped
                        {
                            "has_values": False,
                            "jersey_number": 22,
                            "player": {
                                "id": 998,
                                "common_name": "Ghost",
                                "display_name": "Ghost",
                                "name": "Ghost",
                                "position": {"id": 27, "name": "Attacker"},
                            },
                        },
                        # OK entry
                        {
                            "has_values": True,
                            "jersey_number": 9,
                            "player": {
                                "id": 999,
                                "common_name": "X",
                                "display_name": "X",
                                "name": "X",
                                "position": {"id": 27, "name": "Attacker"},
                            },
                        },
                    ],
                    "pagination": {"has_more": False},
                }
            ],
        }
    )
    raw_archive = _FakeRawArchive()
    player_repo = _FakePlayerRepo()

    count = await bootstrap_squads(
        client=client,
        raw_archive=raw_archive,
        player_repo=player_repo,
        teams=[(17, "BRA")],
        season_id=100,
        today=date(2026, 6, 1),
    )

    assert count == 1
    assert player_repo.upserts[0][1] == 999


@pytest.mark.anyio
async def test_bootstrap_for_season_orchestrates_three_steps() -> None:
    client = _FakeClient(
        {
            "/teams/seasons/100": [
                {
                    "data": [{"id": 17, "name": "Brazil", "short_code": "BRA", "type": "national"}],
                    "pagination": {"has_more": False},
                }
            ],
            "/fixtures": [
                {
                    "data": [
                        {
                            "id": 1,
                            "starting_at": "2026-06-12 20:00:00",
                            "participants": [
                                {"short_code": "BRA", "meta": {"location": "home"}},
                                {"short_code": "FRA", "meta": {"location": "away"}},
                            ],
                        }
                    ],
                    "pagination": {"has_more": False},
                }
            ],
            "/squads/seasons/100/teams/17": [
                {
                    "data": [
                        {
                            "has_values": True,
                            "jersey_number": 10,
                            "player": {
                                "id": 200,
                                "common_name": "Pelé",
                                "display_name": "Pelé",
                                "name": "Edson",
                                "position": {"id": 27, "name": "Attacker"},
                            },
                        }
                    ],
                    "pagination": {"has_more": False},
                }
            ],
        }
    )
    raw_archive = _FakeRawArchive()
    team_repo = _FakeTeamRepo()
    fixture_repo = _FakeFixtureRepo()
    player_repo = _FakePlayerRepo()
    stat_repo = _FakeStatRepo()
    news_repo = _FakeNewsRepo()
    comment_repo = _FakeMatchCommentRepo()

    report = await bootstrap_for_season(
        client=client,
        raw_archive=raw_archive,
        team_repo=team_repo,
        coach_repo=_FakeCoachRepo(),
        fixture_repo=fixture_repo,
        player_repo=player_repo,
        stat_repo=stat_repo,
        news_repo=news_repo,
        comment_repo=comment_repo,
        season_id=100,
        today=date(2026, 6, 1),
    )

    assert report.teams == 1
    assert report.fixtures == 1
    assert report.players == 1
    # News + comments endpoints resolve to empty data in this fake harness,
    # so we still expect 0 ingested but the orchestration must not crash.
    assert report.news == 0
    assert report.comments == 0
    # 3 endpoints (teams, fixtures, squads) + 1 squad re-call for player stats
    # + 2 news endpoints + 1 fixture call for comments = 7 raw archive entries.
    assert len(raw_archive.events) == 7
