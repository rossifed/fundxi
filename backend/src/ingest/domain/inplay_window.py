"""Whether a fixture is currently in its active polling window.

DDD role: Domain Service (pure function). The supervisor consults this
to decide which fixtures need a running inplay poller right now.
"""

from datetime import datetime, timedelta


def is_in_inplay_window(
    *,
    now: datetime,
    kickoff_at: datetime,
    pre_kickoff_min: int,
    post_ft_min: int,
    max_match_duration_min: int = 130,
) -> bool:
    """Return ``True`` iff ``now`` falls within the polling envelope.

    The envelope is:

        [kickoff - pre_kickoff_min, kickoff + max_match_duration_min + post_ft_min]

    The supervisor does not need to know whether the fixture is actually
    finished yet — it just needs a deterministic open / close decision
    based on the schedule. Status transitions (NS → IN_PLAY → FT) are
    detected by the poller itself from Sportmonks' response.
    """
    start = kickoff_at - timedelta(minutes=pre_kickoff_min)
    end = kickoff_at + timedelta(minutes=max_match_duration_min + post_ft_min)
    return start <= now <= end
