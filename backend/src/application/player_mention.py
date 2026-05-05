"""Player mention extraction — Domain Service (pure function).

DDD role: Domain Service. Lives in application/ because it composes domain
entities (Player) but doesn't itself have identity or state.

Strategy: word-boundary regex match against a curated set of name candidates
per player (full_name, display name, last token of full_name). The candidate
set is restricted to the players who could plausibly appear in a given
comment's match (typically the home + away squads), which both reduces
false positives and keeps the search cheap.
"""

import re

from src.domain.player.player import Player


def _candidate_needles(player: Player) -> list[str]:
    needles: set[str] = set()
    if player.full_name:
        needles.add(player.full_name)
        # Last whitespace-separated token (typically the surname).
        parts = player.full_name.split()
        if parts:
            needles.add(parts[-1])
    if player.name:
        needles.add(player.name)
    # Drop short / pure-initial needles that would over-match ("S.", "L.").
    return [n for n in needles if len(n.replace(".", "").strip()) >= 3]


def extract_mentioned_player_ids(text: str, candidates: list[Player]) -> list[int]:
    """Return the player ids whose names appear in the comment text.

    Idempotent and side-effect free. Caller is responsible for scoping
    `candidates` to the relevant player set (e.g. both teams' squads of the
    comment's fixture).
    """
    if not text:
        return []
    mentioned: set[int] = set()
    for player in candidates:
        for needle in _candidate_needles(player):
            pattern = r"\b" + re.escape(needle) + r"\b"
            if re.search(pattern, text, flags=re.IGNORECASE):
                mentioned.add(player.id)
                break
    return sorted(mentioned)
