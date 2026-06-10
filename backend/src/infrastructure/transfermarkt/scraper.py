"""Transfermarkt squad-page parsing — pure functions.

DDD role: Adapter (parsing half). No I/O here: HTML in, value objects out, so the
regexes are unit-testable against saved fixtures. The fetching half lives in
``client.py``.

Recipe (validated 2026-06-09, re-confirmed 2026-06-10):
- Index page ``/weltmeisterschaft/teilnehmer/pokalwettbewerb/FIWC`` lists every
  participant as ``/{team_slug}/startseite/verein/{verein_id}``.
- A team's ``/startseite/verein/{verein_id}`` page carries the whole squad with
  market values — one request per team, no per-player fetch.
- Per player, two links share the Transfermarkt id:
  - value:  ``/{player_slug}/marktwertverlauf/spieler/{id}">€{X}{m|k}`` — the
    authoritative source of slug + id + value (keyed on id, never anchor text,
    which is empty/team-named for a few rows — the first-run name bug).
  - name:   ``/{player_slug}/profil/spieler/{id}">{name}</a>`` — accented display
    name. Absent for the odd captain/badge row → fall back to the de-slugified
    slug (matching normalises accents anyway).
"""

import html as html_lib
import re
from dataclasses import dataclass
from decimal import Decimal

# /{slug}/marktwertverlauf/spieler/{id}"...>€{number}{unit}
_VALUE_RE = re.compile(
    r"/([a-z0-9-]+)/marktwertverlauf/spieler/(\d+)\"[^>]*>\s*€([\d.,]+)\s*([mk]?)",
)
# /{slug}/profil/spieler/{id}">{name}</a>
_NAME_RE = re.compile(r"/profil/spieler/(\d+)\">\s*([^<]+?)\s*</a>")
# index team link with the English team name in the title attr (Accept-Language: en)
_TEAM_RE = re.compile(r"<a[^>]*title=\"([^\"]+)\"[^>]*href=\"/([a-z0-9-]+)/startseite/verein/(\d+)\"")


@dataclass(frozen=True)
class ScrapedTeam:
    slug: str
    verein_id: int
    name: str  # English team name (index title attr)


@dataclass(frozen=True)
class ScrapedPlayer:
    tm_id: int
    slug: str
    name: str
    market_value_m: Decimal


def parse_team_links(index_html: str) -> list[ScrapedTeam]:
    """Extract participant teams (slug, verein_id, English name) from the index page."""
    seen: dict[int, ScrapedTeam] = {}
    for team_name, slug, verein_id in _TEAM_RE.findall(index_html):
        vid = int(verein_id)
        seen.setdefault(vid, ScrapedTeam(slug=slug, verein_id=vid, name=html_lib.unescape(team_name).strip()))
    return list(seen.values())


def parse_squad(team_html: str) -> list[ScrapedPlayer]:
    """Extract every player with a market value from a team's squad page."""
    names = {int(tm_id): html_lib.unescape(text).strip() for tm_id, text in _NAME_RE.findall(team_html)}
    players: dict[int, ScrapedPlayer] = {}
    for slug, raw_id, number, unit in _VALUE_RE.findall(team_html):
        tm_id = int(raw_id)
        players[tm_id] = ScrapedPlayer(
            tm_id=tm_id,
            slug=slug,
            name=names.get(tm_id) or _deslugify(slug),
            market_value_m=_parse_value(number, unit),
        )
    return list(players.values())


def _parse_value(number: str, unit: str) -> Decimal:
    """``"180.00", "m"`` → ``180.000`` €M; ``"950", "k"`` → ``0.950`` €M.

    English locale (``Accept-Language: en``): dot is the decimal separator and a
    comma, when present, is a thousands separator.
    """
    amount = Decimal(number.replace(",", ""))
    if unit == "k":
        amount = amount / Decimal(1000)
    return amount.quantize(Decimal("0.001"))


def _deslugify(slug: str) -> str:
    return slug.replace("-", " ").title()
