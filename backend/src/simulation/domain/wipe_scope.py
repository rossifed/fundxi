"""Scope of a simulation wipe operation.

DDD role: Value Object. A frozen enum that conveys the caller's intent
without leaking any infrastructure detail (e.g., table names).
"""

from enum import Enum


class WipeScope(Enum):
    """Granularity of a simulation reset.

    DATA_ONLY
        Clear time-varying simulation data only (match events, comments,
        derived stats, price ticks). The user's portfolio is preserved,
        so a fresh replay can be run without losing trade history.

    FULL
        Also clear user-owned state (portfolio, holdings, trades) for a
        true clean slate. The default user record itself is preserved.
    """

    DATA_ONLY = "data_only"
    FULL = "full"
