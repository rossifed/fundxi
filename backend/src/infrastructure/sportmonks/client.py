"""Sportmonks HTTP client.

DDD roles:
- `SportmonksClient` (Protocol): port — the use case depends on this abstraction.
- `HttpxSportmonksClient`: Adapter — concrete implementation over httpx.

Surface is intentionally minimal (one method `get`). Pagination, retries on
business errors, etc., are handled by the caller. ISP > god-client.
"""

from typing import Any, Protocol

import httpx
import structlog
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

log = structlog.get_logger(__name__)


def _is_retryable(exc: BaseException) -> bool:
    """Only retry transient failures. A 4xx other than 429 (e.g. 401/403/422)
    is a permanent error that will never recover — retrying it just burns the
    full backoff budget before surfacing. Retry network/transport errors and
    429 + 5xx only."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or 500 <= code < 600
    return False


class SportmonksClient(Protocol):
    async def get(self, endpoint: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]: ...


class SportmonksError(RuntimeError):
    """Raised when Sportmonks returns a non-2xx after retries are exhausted."""


class HttpxSportmonksClient:
    """Adapter implementing SportmonksClient over httpx.AsyncClient."""

    def __init__(self, *, base_url: str, api_token: str, timeout_seconds: float = 30.0) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": api_token, "Accept": "application/json"},
            timeout=timeout_seconds,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "HttpxSportmonksClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    @retry(
        retry=retry_if_exception(_is_retryable),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        stop=stop_after_attempt(5),
        reraise=True,
    )
    async def _do_get(self, endpoint: str, params: dict[str, Any] | None) -> dict[str, Any]:
        response = await self._client.get(endpoint, params=params)
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            raise SportmonksError(f"unexpected non-dict response from {endpoint}: {type(body).__name__}")
        return body

    async def get(self, endpoint: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        log.debug("sportmonks.request", endpoint=endpoint, params=params)
        try:
            body = await self._do_get(endpoint, params)
        except httpx.HTTPStatusError as exc:
            raise SportmonksError(
                f"Sportmonks {endpoint} returned {exc.response.status_code}: {exc.response.text[:300]}"
            ) from exc
        log.debug("sportmonks.response", endpoint=endpoint, keys=list(body.keys()))
        return body
