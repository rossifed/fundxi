"""Unit tests for pick_accent_color — kit palette -> team accent colour."""

from src.domain.team.team_color import pick_accent_color


def test_empty_palette_returns_none() -> None:
    assert pick_accent_color([]) is None


def test_all_white_black_grey_returns_none() -> None:
    assert pick_accent_color(["#FFFFFF", "#000000", "#808080", "#F0F0F0"]) is None


def test_picks_the_vivid_colour_over_white_and_black() -> None:
    # Croatia-style palette: white primary, vivid red, blue, near-black.
    assert pick_accent_color(["#F0F0F0", "#C40010", "#0A0A0A", "#0046A8"]) == "#C40010"


def test_ignores_malformed_entries() -> None:
    assert pick_accent_color(["not-a-color", "#GGGGGG", "12345", "#009C3B"]) == "#009C3B"


def test_normalises_hex_to_uppercase_with_hash() -> None:
    result = pick_accent_color(["009c3b"])
    assert result == "#009C3B"


def test_single_vivid_colour() -> None:
    assert pick_accent_color(["#002395"]) == "#002395"


def test_dominant_colour_wins_over_a_rarer_vivid_one() -> None:
    # France-style: a dark blue repeated across slots, a lone olive trim.
    # The dominant (most frequent) colour wins even if less "vivid".
    assert pick_accent_color(["#022857", "#022857", "#022857", "#999900"]) == "#022857"
