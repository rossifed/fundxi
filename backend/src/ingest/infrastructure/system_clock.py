"""Production ``Clock`` backed by ``datetime.now(UTC)``.

DDD role: Adapter. Trivial wrapper that exists only so tests can swap
a controllable fake without touching production code.
"""

from datetime import UTC, datetime


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)
