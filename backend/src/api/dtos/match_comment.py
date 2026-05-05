"""Pydantic response DTO for match commentaries."""

from pydantic import BaseModel

from src.domain.match.match_comment import MatchComment


class MatchCommentResponse(BaseModel):
    id: int
    fixture_id: int
    minute: int
    extra_minute: int | None
    comment: str
    is_goal: bool
    is_important: bool
    sequence: int

    @classmethod
    def from_domain(cls, comment: MatchComment) -> "MatchCommentResponse":
        return cls(
            id=comment.id,
            fixture_id=comment.fixture_id,
            minute=comment.minute,
            extra_minute=comment.extra_minute,
            comment=comment.comment,
            is_goal=comment.is_goal,
            is_important=comment.is_important,
            sequence=comment.sequence,
        )
