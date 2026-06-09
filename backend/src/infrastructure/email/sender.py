"""Transactional email sending.

DDD roles:
- ``EmailSender`` (Protocol): port — the application depends on this, never
  on a concrete provider.
- ``ConsoleEmailSender``: Adapter for local dev. Logs the message (subject +
  body) instead of sending, so the reset link is visible in the API logs
  without any email account.
- ``ResendEmailSender``: Adapter over the Resend HTTP API (httpx, same stack
  as the Sportmonks client).

``build_sender()`` is the composition helper: it picks the Console adapter in
dev or when no API key is configured, and the Resend adapter otherwise. The
application service takes the port and is blind to which one it got.
"""

from __future__ import annotations

from typing import Protocol

import httpx
import structlog

from src.config import Settings

log = structlog.get_logger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


class EmailError(RuntimeError):
    """Raised when the provider rejects a send."""


class EmailSender(Protocol):
    async def send(self, *, to: str, subject: str, html: str) -> None: ...


class ConsoleEmailSender:
    """Dev adapter — logs the email instead of sending it."""

    async def send(self, *, to: str, subject: str, html: str) -> None:
        log.info("email.console", to=to, subject=subject, html=html)


class ResendEmailSender:
    """Adapter over the Resend API (https://resend.com)."""

    def __init__(self, *, api_key: str, sender: str) -> None:
        self._api_key = api_key
        self._sender = sender

    async def send(self, *, to: str, subject: str, html: str) -> None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.post(
                    RESEND_ENDPOINT,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={"from": self._sender, "to": [to], "subject": subject, "html": html},
                )
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                # Boundary error — surface, don't swallow. The caller decides
                # whether a failed send should fail the request (it doesn't:
                # the user still gets a generic 200, the failure is logged).
                raise EmailError(f"resend send failed: {exc}") from exc


def build_sender(settings: Settings) -> EmailSender:
    if settings.is_dev or not settings.resend_api_key:
        return ConsoleEmailSender()
    return ResendEmailSender(api_key=settings.resend_api_key, sender=settings.email_from)
