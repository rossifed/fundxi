"""SqlAlchemyMatchCommentRepository — Adapter for MatchCommentRepository."""

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.match_comment import MatchComment
from src.infrastructure.db.models.match_comment import MatchCommentORM
from src.infrastructure.sportmonks.projectors.match_comment import (
    comment_names_scorer,
    overturned_goal_ids,
)

# How many minutes a VAR review can trail the goal it annuls. Sportmonks stamps
# the review at or just after the goal (observed +1); a small window absorbs that
# offset when retracting the goal comment, without reaching unrelated minutes.
_VAR_REVIEW_LAG_MINUTES = 3


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

    async def reconcile_overturned_goals(self, fixture_id: int) -> int:
        """Retract goals annulled by VAR: flip ``is_goal`` to False on every
        ``Goal! ...`` comment cancelled by a later ``GOAL OVERTURNED BY VAR``
        sibling (same scorer). Idempotent — the per-comment projector always
        re-derives ``is_goal=True`` from the goal text, this re-applies the
        retraction over the full fixture each call. Returns the count flipped."""
        comments = await self.list_by_fixture(fixture_id)
        cancelled = overturned_goal_ids(comments)
        if not cancelled:
            return 0
        await self._session.execute(
            update(MatchCommentORM)
            .where(MatchCommentORM.id.in_(cancelled))
            .where(MatchCommentORM.is_goal.is_(True))
            .values(is_goal=False)
        )
        return len(cancelled)

    async def disallow_goal(self, fixture_id: int, *, minute: int, scorer_name: str) -> int:
        """Clear the goal flag on the commentary line for a VAR-disallowed goal.

        ``minute`` is the VAR review's minute, which Sportmonks stamps at or just
        AFTER the goal (observed +1: goal 29', review 30'). So we scan a short
        window ``[minute - VAR_REVIEW_LAG, minute]`` rather than the exact minute,
        and among the goal comments there flip only those naming ``scorer_name``
        (accent- and punctuation-insensitive surname match). Driven by the
        structured VAR ``Goal Disallowed`` event, whose ``player_name`` is the
        authoritative scorer. Idempotent. Returns the number of comments flipped."""
        rows = (
            (
                await self._session.execute(
                    select(MatchCommentORM)
                    .where(MatchCommentORM.fixture_id == fixture_id)
                    .where(MatchCommentORM.minute >= minute - _VAR_REVIEW_LAG_MINUTES)
                    .where(MatchCommentORM.minute <= minute)
                    .where(MatchCommentORM.is_goal.is_(True))
                )
            )
            .scalars()
            .all()
        )
        targets = [r.id for r in rows if comment_names_scorer(r.comment, scorer_name)]
        if not targets:
            return 0
        await self._session.execute(
            update(MatchCommentORM).where(MatchCommentORM.id.in_(targets)).values(is_goal=False)
        )
        return len(targets)

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
