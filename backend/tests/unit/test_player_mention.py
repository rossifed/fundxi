"""Unit tests for player mention extraction (Domain Service)."""

from src.application.player_mention import extract_mentioned_player_ids
from src.domain.player.player import Player, Position


def _player(id: int, *, name: str, full_name: str | None = None) -> Player:
    return Player(
        id=id,
        name=name,
        jersey_number=10,
        team_id="ARG",
        position=Position.FORWARD,
        full_name=full_name,
    )


def test_basic_lastname_match() -> None:
    messi = _player(1, name="L. Messi", full_name="Lionel Messi")
    text = "Lionel Messi - Argentina - won a free kick in defence."
    assert extract_mentioned_player_ids(text, [messi]) == [1]


def test_match_via_lastname_only() -> None:
    mbappe = _player(2, name="Kylian Mbappé", full_name="Kylian Mbappé")
    text = "Goal! Argentina 3, France 3 - 1 Kylian Mbappé converts the penalty"
    assert 2 in extract_mentioned_player_ids(text, [mbappe])


def test_two_player_mention_in_one_comment() -> None:
    mac_allister = _player(3, name="Mac Allister", full_name="Alexis Mac Allister")
    alvarez = _player(4, name="Julián Álvarez", full_name="Julián Álvarez")
    text = "New attacking attempt. Alexis Mac Allister shot... Assist - Julián Álvarez."
    ids = extract_mentioned_player_ids(text, [mac_allister, alvarez])
    assert set(ids) == {3, 4}


def test_no_match_outside_candidates() -> None:
    # We only consider provided candidates — a real Messi mention plus a
    # mismatching candidate set must yield empty.
    other = _player(99, name="Haaland", full_name="Erling Haaland")
    text = "Lionel Messi - Argentina - won a free kick"
    assert extract_mentioned_player_ids(text, [other]) == []


def test_no_partial_match() -> None:
    # The substring "Ronald" must not match "Cristiano Ronaldo" via prefix.
    cr7 = _player(7, name="Ronaldo", full_name="Cristiano Ronaldo")
    text = "Ronald who? This game is about Mbappé."
    assert extract_mentioned_player_ids(text, [cr7]) == []


def test_short_name_filtered() -> None:
    # Initial-only or extremely short names are dropped to avoid noise.
    short = _player(50, name="A.", full_name="A.")
    text = "A. is everywhere in this text. A. A. A."
    assert extract_mentioned_player_ids(text, [short]) == []


def test_unicode_lastname() -> None:
    # \b in Python's re handles unicode word characters, so accented names
    # like "Á" / "é" still anchor correctly.
    alvarez = _player(4, name="J. Álvarez", full_name="Julián Álvarez")
    text = "Assist - Julián Álvarez."
    assert extract_mentioned_player_ids(text, [alvarez]) == [4]


def test_multi_word_lastname() -> None:
    mac = _player(3, name="Mac Allister", full_name="Alexis Mac Allister")
    text = "Mac Allister wins the ball back."
    assert extract_mentioned_player_ids(text, [mac]) == [3]


def test_empty_text() -> None:
    p = _player(1, name="Messi", full_name="Lionel Messi")
    assert extract_mentioned_player_ids("", [p]) == []


def test_idempotent_dedup() -> None:
    # Multiple matches of the same player count once.
    messi = _player(1, name="Messi", full_name="Lionel Messi")
    text = "Messi shoots! Messi scores! Lionel Messi celebrates!"
    assert extract_mentioned_player_ids(text, [messi]) == [1]
