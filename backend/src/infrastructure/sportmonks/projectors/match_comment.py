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

import unicodedata
from collections.abc import Sequence
from typing import Any

from src.domain.match.match_comment import MatchComment

_OVERTURN_PREFIX = "goal overturned by var"


def _fold(text: str) -> str:
    """Lowercase + strip diacritics, so 'Souček' and 'Soucek' compare equal."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def comment_names_scorer(comment_text: str, scorer_name: str) -> bool:
    """True iff a goal commentary line names ``scorer_name`` (accent- and
    case-insensitive, surname match).

    Bridges the two Sportmonks feeds that disagree on diacritics: the VAR
    event carries ``player_name='Tomáš Souček'`` while the commentary reads
    ``Goal! Tomas Soucek scores ...``. Matching the last name token (folded)
    is enough to pair the annulment with its goal comment. Surnames shorter
    than 3 chars are rejected to avoid spurious substring hits.
    """
    tokens = scorer_name.split()
    if not tokens:
        return False
    surname = _fold(tokens[-1])
    return len(surname) >= 3 and surname in _fold(comment_text)


def is_goal_comment(comment_text: str) -> bool:
    """True iff the commentary line reports an actual goal.

    Pure, deterministic, case/whitespace-insensitive. ``Goal!`` covers
    open-play, penalties and shootout lines; ``Own Goal by`` covers own
    goals (they never start with ``Goal!``). ``GOAL OVERTURNED BY VAR``
    is excluded for free — it has no ``!`` and is not an own-goal line.
    """
    head = comment_text.strip().lower()
    return head.startswith("goal!") or head.startswith("own goal by")


def is_goal_overturn_comment(comment_text: str) -> bool:
    """True iff the line announces a VAR-disallowed goal.

    Sportmonks emits, for a cancelled goal, a ``Goal! ...`` line
    immediately followed by a ``GOAL OVERTURNED BY VAR: <scorer> - <team>
    -  scores but the goal is ruled out after a VAR review.`` sibling. The
    overturn line is itself NOT a goal (``is_goal_comment`` is False on it);
    this predicate identifies it so the preceding goal can be retracted.
    """
    return comment_text.strip().lower().startswith(_OVERTURN_PREFIX)


def overturn_scorer_name(comment_text: str) -> str | None:
    """Scorer named in a ``GOAL OVERTURNED BY VAR`` line, or None.

    The name sits between the ``...VAR:`` colon and the first `` - `` team
    separator (e.g. ``Lautaro Martínez`` in ``GOAL OVERTURNED BY VAR:
    Lautaro Martínez  - Argentina -  scores...``). Returns None on a
    non-overturn line.
    """
    head = comment_text.strip()
    if not head.lower().startswith(_OVERTURN_PREFIX):
        return None
    after = head[len(_OVERTURN_PREFIX) :].lstrip(": ").strip()
    cut = after.find(" - ")
    name = (after[:cut] if cut >= 0 else after).strip()
    return name or None


def overturned_goal_ids(comments: Sequence[MatchComment]) -> set[int]:
    """Ids of goal comments cancelled by a later VAR-overturn line.

    Pure. Walks the fixture's comments in ``sequence`` order; each
    ``GOAL OVERTURNED BY VAR: <scorer>`` line cancels the most recent
    not-yet-cancelled goal comment whose text names that scorer. Matching
    on scorer (not mere adjacency) keeps a player's earlier *valid* goal
    intact when a *later* one is disallowed, and a duplicated overturn
    line (observed in the data) only cancels once. An overturn line with
    no preceding goal (also observed) cancels nothing.
    """
    ordered = sorted(comments, key=lambda c: c.sequence)
    open_goals: list[MatchComment] = []
    cancelled: set[int] = set()
    for c in ordered:
        if c.is_goal:
            open_goals.append(c)
            continue
        scorer = overturn_scorer_name(c.comment)
        if scorer is None:
            continue
        needle = scorer.lower()
        for goal in reversed(open_goals):
            if goal.id not in cancelled and needle in goal.comment.lower():
                cancelled.add(goal.id)
                break
    return cancelled


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
