"""project_match_comment — Sportmonks comment payload → (MatchComment, sportmonks_id).

DDD role: Domain Service (pure function), Sportmonks-specific.

Assumed shape:
{
  "id": int,
  "fixture_id": int,
  "comment": str,
  "minute": int,
  "extra_minute": int | null,
  "is_goal": bool,        # provider flag — UNRELIABLE, deliberately ignored
  "is_important": bool,
  "order": int
}

`is_goal` is NOT taken from the provider boolean: Sportmonks' comment
`is_goal` is wrong in both directions in the WC data — true on "won a
free kick", "Fouled by", yellow cards; false on the actual "Goal! ..."
lines (verified, see `analysis/comment-is-goal.md`). The authoritative
provider signal for "this line is a goal" is the comment TEXT itself,
which is deterministic: real goals read ``Goal! <team> x, <team> y.
<scorer> ...`` or ``Own Goal by <player>, <team>.``; a VAR-cancelled
goal reads ``GOAL OVERTURNED BY VAR`` (no ``!``). We re-derive the flag
from the text — parsing the provider's own content, not inventing it.
"""

from typing import Any

from src.domain.match.match_comment import MatchComment


def is_goal_comment(comment_text: str) -> bool:
    """True iff the commentary line reports an actual goal.

    Pure, deterministic, case/whitespace-insensitive. ``Goal!`` covers
    open-play, penalties and shootout lines; ``Own Goal by`` covers own
    goals (they never start with ``Goal!``). ``GOAL OVERTURNED BY VAR``
    is excluded for free — it has no ``!`` and is not an own-goal line.
    """
    head = comment_text.strip().lower()
    return head.startswith("goal!") or head.startswith("own goal by")


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
        is_goal=is_goal_comment(comment_text),
        is_important=bool(payload.get("is_important")),
        sequence=sequence,
    )
    return comment, sportmonks_id
