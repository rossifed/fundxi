"""SqlAlchemyMatchCommentRepository — Adapter for MatchCommentRepository."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.match_comment import MatchComment
from src.infrastructure.db.models.match_comment import MatchCommentORM


def _to_domain(orm: MatchCommentORM) -> MatchComment:
    return MatchComment(
        id=orm.id,
        fixture_id=orm.fixture_id,
        minute=orm.minute,
        extra_minute=orm.extra_minute,
        comment=orm.comment,
        is_goal=orm.is_goal,
        is_important=orm.is_important,
        sequence=orm.sequence,
    )


class SqlAlchemyMatchCommentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_by_sportmonks_id(self, comment: MatchComment, *, sportmonks_id: int) -> None:
        stmt = pg_insert(MatchCommentORM).values(
            sportmonks_id=sportmonks_id,
            fixture_id=comment.fixture_id,
            minute=comment.minute,
            extra_minute=comment.extra_minute,
            comment=comment.comment,
            is_goal=comment.is_goal,
            is_important=comment.is_important,
            sequence=comment.sequence,
        )
        update_payload = {
            "fixture_id": stmt.excluded.fixture_id,
            "minute": stmt.excluded.minute,
            "extra_minute": stmt.excluded.extra_minute,
            "comment": stmt.excluded.comment,
            "is_goal": stmt.excluded.is_goal,
            "is_important": stmt.excluded.is_important,
            "sequence": stmt.excluded.sequence,
        }
        stmt = stmt.on_conflict_do_update(index_elements=["sportmonks_id"], set_=update_payload)
        await self._session.execute(stmt)

    async def list_by_fixture(self, fixture_id: int) -> list[MatchComment]:
        result = await self._session.execute(
            select(MatchCommentORM).where(MatchCommentORM.fixture_id == fixture_id).order_by(MatchCommentORM.sequence)
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def list_by_team(self, team_id: str, *, limit: int = 100) -> list[MatchComment]:
        from src.infrastructure.db.models.fixture import FixtureORM

        result = await self._session.execute(
            select(MatchCommentORM)
            .join(FixtureORM, MatchCommentORM.fixture_id == FixtureORM.id)
            .where((FixtureORM.home_team_id == team_id) | (FixtureORM.away_team_id == team_id))
            .order_by(FixtureORM.kickoff_at.desc(), MatchCommentORM.sequence)
            .limit(limit)
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def list_by_player(self, player_id: int, *, limit: int = 100) -> list[MatchComment]:
        from src.infrastructure.db.models.match_comment_player_mention import (
            MatchCommentPlayerMentionORM,
        )

        result = await self._session.execute(
            select(MatchCommentORM)
            .join(
                MatchCommentPlayerMentionORM,
                MatchCommentPlayerMentionORM.match_comment_id == MatchCommentORM.id,
            )
            .where(MatchCommentPlayerMentionORM.player_id == player_id)
            .order_by(MatchCommentORM.fixture_id.desc(), MatchCommentORM.sequence)
            .limit(limit)
        )
        return [_to_domain(row) for row in result.scalars().all()]
