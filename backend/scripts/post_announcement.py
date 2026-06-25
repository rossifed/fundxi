"""Post an in-app announcement (admin tool) — no deploy needed.

Inserts a row into ``app.announcement``; signed-in users then see it once and
dismiss it. Use it to ship a release note / heads-up (e.g. when the live-trading
lock lands, so users don't read it as a bug).

Usage (DATABASE_URL must point at the TARGET database):
    DATABASE_URL=postgresql+asyncpg://...  APP_ENV=dev  PYTHONPATH=. \\
        uv run python -m scripts.post_announcement \\
            --title "Trading pauses during live matches" \\
            --body  "Set your team before kick-off; trading reopens at half-time and full-time." \\
            --severity important
"""

import argparse
import asyncio

import structlog

from src.infrastructure.db.repositories.announcement import SqlAlchemyAnnouncementRepository
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)


async def run(*, title: str, body: str, severity: str) -> None:
    async with SessionLocal() as session:
        announcement_id = await SqlAlchemyAnnouncementRepository(session).create(
            title=title, body=body, severity=severity
        )
        await session.commit()
        log.info("announcement.posted", id=announcement_id, title=title, severity=severity)


def main() -> int:
    parser = argparse.ArgumentParser(description="Post an in-app announcement.")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--severity", default="info", choices=["info", "important"])
    args = parser.parse_args()
    asyncio.run(run(title=args.title, body=args.body, severity=args.severity))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
