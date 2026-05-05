"""project_match_comment — Sportmonks comment payload → (MatchComment, sportmonks_id).

DDD role: Domain Service (pure function), Sportmonks-specific.

Assumed shape:
{
  "id": int,
  "fixture_id": int,
  "comment": str,
  "minute": int,
  "extra_minute": int | null,
  "is_goal": bool,
  "is_important": bool,
  "order": int
}
"""

from typing import Any

from src.domain.match.match_comment import MatchComment


def project_match_comment(payload: dict[str, Any], *, fixture_id: int) -> tuple[MatchComment, int]:
    sportmonks_id = payload["id"]
    if not isinstance(sportmonks_id, int):
        raise TypeError(f"comment.id must be int, got {type(sportmonks_id).__name__}")

    comment_text = payload.get("comment")
    if not isinstance(comment_text, str) or not comment_text:
        raise ValueError(f"comment payload missing text: {payload!r}")

    minute = payload.get("minute")
    if not isinstance(minute, int):
        raise ValueError(f"comment payload missing minute: {payload!r}")

    extra = payload.get("extra_minute")
    extra_minute = extra if isinstance(extra, int) else None

    sequence_raw = payload.get("order")
    sequence = sequence_raw if isinstance(sequence_raw, int) else 0

    comment = MatchComment(
        id=0,
        fixture_id=fixture_id,
        minute=minute,
        extra_minute=extra_minute,
        comment=comment_text,
        is_goal=bool(payload.get("is_goal")),
        is_important=bool(payload.get("is_important")),
        sequence=sequence,
    )
    return comment, sportmonks_id
