"""Post a product-research survey question (admin tool) — no deploy needed.

Inserts a row into ``app.survey_question``; signed-in users are then asked it
once and their answer (or skip) is stored in ``app.survey_answer``. Read the
results with plain SQL, e.g.::

    SELECT answer_bool, count(*), avg(answer_amount)
    FROM app.survey_answer WHERE question_id = <id> GROUP BY answer_bool;

Usage (DATABASE_URL must point at the TARGET database):
    DATABASE_URL=postgresql+asyncpg://...  APP_ENV=dev  PYTHONPATH=. \\
        uv run python -m scripts.post_survey_question \\
            --code real_money_intent \\
            --title "Would you invest real money in a football player?" \\
            --body  "No commitment, we are just curious." \\
            --kind yes_no_amount
"""

import argparse
import asyncio

import structlog

from src.infrastructure.db.repositories.survey import SqlAlchemySurveyRepository
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)


async def run(*, code: str, title: str, body: str | None, kind: str) -> None:
    async with SessionLocal() as session:
        question_id = await SqlAlchemySurveyRepository(session).create(code=code, title=title, body=body, kind=kind)
        await session.commit()
        log.info("survey_question.posted", id=question_id, code=code, kind=kind)


def main() -> int:
    parser = argparse.ArgumentParser(description="Post a survey question.")
    parser.add_argument("--code", required=True, help="stable unique slug, e.g. real_money_intent")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", default=None)
    parser.add_argument("--kind", default="yes_no", choices=["yes_no", "yes_no_amount", "text"])
    args = parser.parse_args()
    asyncio.run(run(code=args.code, title=args.title, body=args.body, kind=args.kind))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
