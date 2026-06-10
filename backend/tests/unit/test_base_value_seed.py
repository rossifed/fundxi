"""Unit tests for the base-value matcher — OUR players <-> Transfermarkt squads."""

from decimal import Decimal

from src.application.base_value_seed import (
    OurPlayer,
    TmPlayer,
    match_players,
    normalize_name,
)


def _tm(tm_id: int, name: str, team: str, value: str = "10") -> TmPlayer:
    return TmPlayer(tm_id=tm_id, name=name, market_value_m=Decimal(value), team_name=team)


def test_normalize_strips_accents_punctuation_and_case() -> None:
    assert normalize_name("Ousmane Dembélé") == "ousmane dembele"
    assert normalize_name("Matthijs de Ligt") == "matthijs de ligt"
    assert normalize_name("Al-Ghannam") == "al ghannam"


def test_normalize_transliterates_non_decomposing_latin_letters() -> None:
    # NFKD does not decompose these — without transliteration they get stripped.
    assert normalize_name("Martin Ødegaard") == "martin odegaard"
    assert normalize_name("Kenan Y\u0131ld\u0131z") == "kenan yildiz"  # dotless-i
    assert normalize_name("Łukasz") == "lukasz"


def test_transliterated_name_matches_plain_ascii_variant() -> None:
    our = [OurPlayer(1, "Martin Ødegaard", "Norway")]
    tm = [_tm(2, "Martin Odegaard", "Norway", "65")]
    result = match_players(our, tm)
    assert [(m.player_id, m.market_value_m) for m in result.matched] == [(1, Decimal("65"))]


def test_exact_name_match_writes_the_value() -> None:
    our = [OurPlayer(1, "Ousmane Dembélé", "France")]
    tm = [_tm(99, "Ousmane Dembele", "France", "100")]
    result = match_players(our, tm)
    assert [(m.player_id, m.tm_id, m.market_value_m) for m in result.matched] == [(1, 99, Decimal("100"))]
    assert result.unmatched_players == []


def test_team_alias_bridges_english_spellings() -> None:
    # Our English core.team.name vs Transfermarkt's English name.
    our = [OurPlayer(1, "Son Heung-min", "Korea Republic")]
    tm = [_tm(7, "Son Heung-min", "South Korea")]
    result = match_players(our, tm)
    assert len(result.matched) == 1
    assert result.unmatched_teams == []


def test_same_surname_different_player_is_not_matched() -> None:
    # The cardinal rule: never assign a value to the wrong player.
    our = [OurPlayer(1, "Jurriën Timber", "Netherlands")]
    tm = [_tm(2, "Quinten Timber", "Netherlands")]
    result = match_players(our, tm)
    assert result.matched == []
    assert [p.player_id for p in result.unmatched_players] == [1]


def test_ambiguous_duplicate_name_yields_no_match() -> None:
    # Two TM "Danilo" in the same squad -> cannot disambiguate -> NULL, not a guess.
    our = [OurPlayer(1, "Danilo", "Brazil")]
    tm = [_tm(2, "Danilo", "Brazil"), _tm(3, "Danilo", "Brazil")]
    result = match_players(our, tm)
    assert result.matched == []
    assert len(result.unmatched_players) == 1


def test_surname_initial_fallback_matches_minor_variant() -> None:
    # Differs on the given-name form but unique surname+initial within the team.
    our = [OurPlayer(1, "Manu Koné", "France")]
    tm = [_tm(2, "Manu Kone", "France")]
    result = match_players(our, tm)
    assert len(result.matched) == 1


def test_token_subset_matches_extra_middle_name() -> None:
    our = [OurPlayer(1, "Mattéo Guendouzi Olié", "France")]
    tm = [_tm(2, "Mattéo Guendouzi", "France")]
    result = match_players(our, tm)
    assert len(result.matched) == 1


def test_explicit_override_pins_a_specific_tm_player() -> None:
    # player_id 378 is pinned to tm_id 238223 — resolves the two-"Ederson" ambiguity
    # by DOB that the name matcher cannot. The value still comes from the TM row.
    our = [OurPlayer(378, "Ederson", "Brazil")]
    tm = [_tm(238223, "Ederson", "Brazil", "10"), _tm(999, "Éderson", "Brazil", "45")]
    result = match_players(our, tm)
    assert [(m.player_id, m.tm_id, m.market_value_m) for m in result.matched] == [(378, 238223, Decimal("10"))]


def test_unknown_team_is_reported_not_crashed() -> None:
    our = [OurPlayer(1, "Some Player", "Atlantis")]
    result = match_players(our, [])
    assert result.matched == []
    assert result.unmatched_teams == ["Atlantis"]
    assert len(result.unmatched_players) == 1
