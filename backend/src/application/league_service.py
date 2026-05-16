"""League service.

DDD role: Application Service. Orchestrates the league domain
(InviteCode VO, League entity) + the league/portfolio repositories.
HTTP shape is the router's concern.

Membership model: the GLOBAL league is auto-joined at registration
(see ``auth_service.register_user``). PRIVATE leagues are created here
(creator auto-joins) and joined via invite code.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.league.league import InviteCode, LeaderboardEntry, League
from src.infrastructure.db.repositories.league import SqlAlchemyLeagueRepository

_MAX_INVITE_ATTEMPTS = 8
_MAX_NAME_LENGTH = 64


class LeagueNotFoundError(Exception):
    pass


class InvalidInviteError(Exception):
    pass


class AlreadyMemberError(Exception):
    pass


class NotAMemberError(Exception):
    pass


class InvalidLeagueNameError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class LeagueSummary:
    id: int
    name: str
    kind: str
    is_public: bool
    invite_code: str | None
    member_count: int
    my_rank: int
    my_return_pct: float


@dataclass(frozen=True, slots=True)
class LeagueDetail:
    id: int
    name: str
    kind: str
    is_public: bool
    invite_code: str | None
    member_count: int
    leaderboard: list[LeaderboardEntry]


def _normalise_name(raw: str) -> str:
    name = raw.strip()
    if not name or len(name) > _MAX_NAME_LENGTH:
        raise InvalidLeagueNameError("league name must be 1-64 characters")
    return name


async def create_private_league(session: AsyncSession, *, user_id: int, name: str) -> LeagueDetail:
    repo = SqlAlchemyLeagueRepository(session)
    clean_name = _normalise_name(name)

    code: str | None = None
    for _ in range(_MAX_INVITE_ATTEMPTS):
        candidate = InviteCode.generate().value
        if await repo.get_by_invite_code(candidate) is None:
            code = candidate
            break
    if code is None:
        raise InvalidInviteError("could not allocate a unique invite code, retry")

    league = await repo.create_private(name=clean_name, created_by=user_id, invite_code=code)
    await repo.add_member(league_id=league.id, user_id=user_id)
    await session.commit()
    return await _detail(session, league=league, user_id=user_id)


async def join_league(session: AsyncSession, *, user_id: int, invite_code: str) -> LeagueDetail:
    repo = SqlAlchemyLeagueRepository(session)
    try:
        code = InviteCode.parse(invite_code).value
    except ValueError as exc:
        raise InvalidInviteError("invalid invite code format") from exc

    league = await repo.get_by_invite_code(code)
    if league is None:
        raise LeagueNotFoundError("no league for this invite code")
    if await repo.is_member(league_id=league.id, user_id=user_id):
        raise AlreadyMemberError("you are already in this league")

    await repo.add_member(league_id=league.id, user_id=user_id)
    await session.commit()
    return await _detail(session, league=league, user_id=user_id)


async def list_user_leagues(session: AsyncSession, *, user_id: int) -> list[LeagueSummary]:
    repo = SqlAlchemyLeagueRepository(session)
    leagues = await repo.list_for_user(user_id)
    summaries: list[LeagueSummary] = []
    for league in leagues:
        board = await repo.leaderboard(league_id=league.id, me_user_id=user_id)
        me = next((e for e in board if e.is_me), None)
        summaries.append(
            LeagueSummary(
                id=league.id,
                name=league.name,
                kind=league.kind.value,
                is_public=league.is_public,
                invite_code=league.invite_code,
                member_count=len(board),
                my_rank=me.rank if me else 0,
                my_return_pct=me.return_pct if me else 0.0,
            )
        )
    return summaries


async def get_league_detail(session: AsyncSession, *, user_id: int, league_id: int) -> LeagueDetail:
    repo = SqlAlchemyLeagueRepository(session)
    league = await repo.get_by_id(league_id)
    if league is None:
        raise LeagueNotFoundError(f"league {league_id} not found")
    if not await repo.is_member(league_id=league_id, user_id=user_id):
        raise NotAMemberError("you are not a member of this league")
    return await _detail(session, league=league, user_id=user_id)


async def _detail(session: AsyncSession, *, league: League, user_id: int) -> LeagueDetail:
    repo = SqlAlchemyLeagueRepository(session)
    board = await repo.leaderboard(league_id=league.id, me_user_id=user_id)
    return LeagueDetail(
        id=league.id,
        name=league.name,
        kind=league.kind.value,
        is_public=league.is_public,
        invite_code=league.invite_code,
        member_count=len(board),
        leaderboard=board,
    )
