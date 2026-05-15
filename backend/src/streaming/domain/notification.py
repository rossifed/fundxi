"""Subject → topic mapping for the NATS bus.

DDD role: Domain Service (pure function). The only place that knows
the ``fundxi.<kind>.<id>`` naming scheme. Maps an incoming NATS
subject to the set of SSE topics that should receive its payload.

Topic vocabulary:
  - ``fixture:<id>``  — everything happening in one fixture (events,
    comments, status, lineup, per-player stats).
  - ``matches``       — *any* fixture had activity (events / comments /
    status). Lets the Home "Match Center" card notice that a match just
    went live (or ended) without knowing the fixture id up front.
  - ``player:<id>``   — that player's price ticks.
  - ``prices``        — every player's price ticks (the Portfolio page
    subscribes here and filters client-side by its holdings).
  - ``news``          — news refreshed.
  - ``standings``     — group tables refreshed.
  - ``reference``     — reference data (teams/fixtures/players) refreshed.
"""

_FIXTURE_KINDS = frozenset(
    {"match_event", "match_comment", "fixture_status", "lineup", "player_match_stat", "team_match_stat"}
)
_GLOBAL_KIND_TO_TOPIC: dict[str, str] = {
    "news": "news",
    "standings": "standings",
    "reference_refreshed": "reference",
}


def topics_for_subject(subject: str) -> tuple[str, ...]:
    """Return the SSE topics a NATS ``subject`` fans out to (possibly empty)."""
    parts = subject.split(".")
    if len(parts) < 2 or parts[0] != "fundxi":
        return ()
    kind = parts[1]
    entity = parts[2] if len(parts) >= 3 else None

    if kind in _FIXTURE_KINDS:
        # Both the per-fixture topic and the global "matches" feed.
        return (f"fixture:{entity}", "matches") if entity is not None else ()
    if kind == "player_price_tick":
        return (f"player:{entity}", "prices") if entity is not None else ()
    if kind in _GLOBAL_KIND_TO_TOPIC:
        return (_GLOBAL_KIND_TO_TOPIC[kind],)
    return ()
