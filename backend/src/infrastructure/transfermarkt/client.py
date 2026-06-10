"""Transfermarkt HTTP client — fetching half of the scrape adapter.

DDD role: Adapter (I/O half). Browser User-Agent + ``Accept-Language: en`` (English
value format ``€{X}m``/``€{X}k``), and a sequential 2s throttle between requests —
never burst. Transfermarkt has no official API; this is HTML scraping against their
ToS, accepted as a one-shot pragmatic seed (see backend/docs/base-value-seed.md).
"""

import asyncio
from types import TracebackType

import httpx

_BASE_URL = "https://www.transfermarkt.com"
_INDEX_PATH = "/weltmeisterschaft/teilnehmer/pokalwettbewerb/FIWC"
_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
_THROTTLE_SECONDS = 2.0


class TransfermarktClient:
    """Async context manager wrapping httpx with the scrape-safe defaults."""

    def __init__(self, *, throttle_seconds: float = _THROTTLE_SECONDS) -> None:
        self._throttle_seconds = throttle_seconds
        self._client = httpx.AsyncClient(
            base_url=_BASE_URL,
            headers={"User-Agent": _USER_AGENT, "Accept-Language": "en"},
            timeout=httpx.Timeout(30.0),
            follow_redirects=True,
        )

    async def __aenter__(self) -> "TransfermarktClient":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self._client.aclose()

    async def fetch_index(self) -> str:
        return await self._get(_INDEX_PATH)

    async def fetch_team(self, team_slug: str, verein_id: int) -> str:
        return await self._get(f"/{team_slug}/startseite/verein/{verein_id}")

    async def _get(self, path: str) -> str:
        response = await self._client.get(path)
        response.raise_for_status()
        # Sequential throttle AFTER the request so callers can loop naively.
        await asyncio.sleep(self._throttle_seconds)
        return response.text
