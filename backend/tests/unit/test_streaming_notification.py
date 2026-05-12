"""Unit tests for the subject → topic mapping."""

import pytest

from src.streaming.domain.notification import topics_for_subject


@pytest.mark.parametrize(
    ("subject", "expected"),
    [
        ("fundxi.match_event.42", ("fixture:42",)),
        ("fundxi.match_comment.42", ("fixture:42",)),
        ("fundxi.fixture_status.42", ("fixture:42",)),
        ("fundxi.lineup.42", ("fixture:42",)),
        ("fundxi.player_match_stat.42", ("fixture:42",)),
        ("fundxi.player_price_tick.777", ("player:777", "prices")),
        ("fundxi.news", ("news",)),
        ("fundxi.standings", ("standings",)),
        ("fundxi.reference_refreshed", ("reference",)),
    ],
)
def test_known_subjects_map_to_topics(subject: str, expected: tuple[str, ...]) -> None:
    assert topics_for_subject(subject) == expected


@pytest.mark.parametrize(
    "subject",
    [
        "",
        "other.match_event.42",     # wrong prefix
        "fundxi",                    # no kind
        "fundxi.match_event",        # fixture kind but no id
        "fundxi.player_price_tick",  # tick kind but no id
        "fundxi.unknown_kind.1",     # unrecognised kind
    ],
)
def test_unknown_or_malformed_subjects_map_to_nothing(subject: str) -> None:
    assert topics_for_subject(subject) == ()
