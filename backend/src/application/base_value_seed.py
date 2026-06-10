"""Base-value matching — pure functions (Application Service / Use Case core).

DDD role: Use Case (pure half). Reconciles OUR Sportmonks-fed WC2026 players with
the scraped Transfermarkt squads to seed ``core.player.base_value``. No I/O: lists
in, a MatchResult out, so the matching rules are unit-testable.

Matching is anchored on OUR players (the authoritative universe). For each of our
players we look for their value in the TM squad of THEIR team, by normalised name.
Conservative by design: a candidate is accepted ONLY when it resolves to exactly
one TM player within the team — ambiguity yields no match (NULL → UI "—"), never a
wrong value. TM-only players (not in our DB) are ignored.

Team bridge: TM team slugs are German but the index carries the English team name
(``Accept-Language: en``); we match it to our English ``core.team.name``. A small
explicit alias map covers the spellings that differ between providers — this is ID
reconciliation, not invented data.
"""

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal

# Our core.team.name (normalised) -> Transfermarkt team_name (normalised).
# Only the spellings that differ after accent-stripped normalisation (Türkiye,
# Curaçao, Iran, United States already match natively once accents are removed).
_TEAM_ALIASES: dict[str, str] = {
    "korea republic": "south korea",
    "cote d ivoire": "ivory coast",
    "congo dr": "democratic republic of the congo",
    "cape verde islands": "cape verde",
    "czech republic": "czechia",
    "bosnia and herzegovina": "bosnia herzegovina",
}

# Verified per-player reconciliations the name matcher cannot resolve on its own:
# romanisation joins ("Al-Rosan" vs "Al-Rousan"), name order ("Issahaku Fatawu" vs
# "Abdul Fatawu"), and same-name duplicates disambiguated by date of birth (the two
# Brazil "Danilo", the two "Ederson"). Keyed by our ``core.player.id`` -> the pinned
# Transfermarkt ``tm_player_id``; the value is still read from the raw archive, so
# nothing is invented. Each entry was checked by hand (DOB / position / club).
_PLAYER_TM_ID_OVERRIDES: dict[int, int] = {
    1211: 864121,  # Issahaku Fatawu (Ghana) -> Abdul Fatawu
    13833: 539961,  # Yazan Alarab (Jordan) -> Yazan Al-Arab
    13844: 310801,  # Mohammad Al Daoud (Jordan) -> Mohammad Al-Dawoud
    13848: 561481,  # Saed Al-Rosan (Jordan) -> Saed Al-Rousan
    13852: 1252820,  # Odeh Fakhouri (Jordan) -> Odeh Fakhoury
    378: 238223,  # Ederson (Brazil, GK b.1993) -> Ederson €10m, not Éderson €45m
    366: 145707,  # Danilo (Brazil, RB b.1991) -> Danilo €2m
    13250: 808509,  # Danilo (Brazil, mid b.2001) -> Danilo €32m
}


@dataclass(frozen=True)
class OurPlayer:
    player_id: int
    name: str
    team_name: str


@dataclass(frozen=True)
class TmPlayer:
    tm_id: int
    name: str
    market_value_m: Decimal
    team_name: str


@dataclass(frozen=True)
class Match:
    player_id: int
    tm_id: int
    market_value_m: Decimal


@dataclass
class MatchResult:
    matched: list[Match] = field(default_factory=list)
    unmatched_players: list[OurPlayer] = field(default_factory=list)
    # Our team names that found no TM squad at all (need an alias or are non-WC2026).
    unmatched_teams: list[str] = field(default_factory=list)


# Latin letters with NO canonical NFKD decomposition — without this map they would
# be dropped (the regex strips them), silently mangling names: "Odegaard" with a
# slashed-o became "degaard" vs TM "Odegaard"; a dotless-i name lost its "i".
# Transliterate them first. (Dotless-i U+0131 is escaped to keep the source ASCII.)
_TRANSLITERATE = str.maketrans(
    {
        "ø": "o", "Ø": "o", "\u0131": "i", "\u0130": "i", "ł": "l", "Ł": "l",
        "đ": "d", "Đ": "d", "ð": "d", "Ð": "d", "þ": "th", "Þ": "th",
        "ß": "ss", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ħ": "h",
    }
)


def normalize_name(value: str) -> str:
    """Lowercase, transliterate + strip accents, drop punctuation, collapse spaces."""
    transliterated = value.translate(_TRANSLITERATE)
    decomposed = unicodedata.normalize("NFKD", transliterated)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9 ]", " ", stripped.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _team_key(team_name: str, *, alias: bool) -> str:
    key = normalize_name(team_name)
    return _TEAM_ALIASES.get(key, key) if alias else key


def match_players(our_players: list[OurPlayer], tm_players: list[TmPlayer]) -> MatchResult:
    tm_by_id = {tm.tm_id: tm for tm in tm_players}
    tm_by_team: dict[str, list[TmPlayer]] = defaultdict(list)
    for tm in tm_players:
        tm_by_team[_team_key(tm.team_name, alias=False)].append(tm)

    result = MatchResult()
    # Explicit per-player overrides win first — they are absolute (team-independent).
    our_by_team: dict[str, list[OurPlayer]] = defaultdict(list)
    for player in our_players:
        pinned = _PLAYER_TM_ID_OVERRIDES.get(player.player_id)
        tm = tm_by_id.get(pinned) if pinned is not None else None
        if tm is not None:
            result.matched.append(Match(player.player_id, tm.tm_id, tm.market_value_m))
        else:
            our_by_team[_team_key(player.team_name, alias=True)].append(player)

    for team_key, players in our_by_team.items():
        squad = tm_by_team.get(team_key)
        if not squad:
            result.unmatched_teams.append(players[0].team_name)
            result.unmatched_players.extend(players)
            continue
        _match_within_team(players, squad, result)
    return result


def _match_within_team(players: list[OurPlayer], squad: list[TmPlayer], result: MatchResult) -> None:
    # Three indexes, tried in order, each accepting only a UNIQUE hit.
    by_full: dict[str, list[TmPlayer]] = defaultdict(list)
    by_surname_initial: dict[tuple[str, str], list[TmPlayer]] = defaultdict(list)
    tm_tokens: list[tuple[frozenset[str], TmPlayer]] = []
    for tm in squad:
        tokens = normalize_name(tm.name).split()
        if not tokens:
            continue
        by_full[" ".join(tokens)].append(tm)
        by_surname_initial[(tokens[-1], tokens[0][0])].append(tm)
        tm_tokens.append((frozenset(tokens), tm))

    for player in players:
        tokens = normalize_name(player.name).split()
        if not tokens:
            result.unmatched_players.append(player)
            continue
        hit = _unique(by_full.get(" ".join(tokens)))
        if hit is None:
            hit = _unique(by_surname_initial.get((tokens[-1], tokens[0][0])))
        if hit is None:
            our_set = frozenset(tokens)
            subset_hits = [tm for tm_set, tm in tm_tokens if tm_set <= our_set or our_set <= tm_set]
            hit = _unique(subset_hits)
        if hit is None:
            result.unmatched_players.append(player)
        else:
            result.matched.append(Match(player.player_id, hit.tm_id, hit.market_value_m))


def _unique(candidates: list[TmPlayer] | None) -> TmPlayer | None:
    if candidates and len(candidates) == 1:
        return candidates[0]
    return None
