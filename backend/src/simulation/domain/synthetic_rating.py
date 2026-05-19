"""Synthetic live-rating generator — UI/UX REHEARSAL ONLY.

DDD role: Domain Service (pure). Produces a plausible-looking
minute-by-minute rating trajectory so the live plumbing (poll → kernel
→ tick → NATS → SSE → price flash) can be exercised end-to-end before a
real match exists.

NOT real data. The magnitude is fabricated; it is NOT coherent with any
player's real performance. The only real input is the *timing* of
archived events (a goal nudges the synthetic rating up at the real
goal minute). Output is always tagged ``source = "rehearsal"`` so it
can never be mistaken for, or queried as, real engine data. Tracked as
a debt in the project memory file.

Deterministic given a seeded ``random.Random`` → reproducible runs.
"""

from dataclasses import dataclass
from random import Random


@dataclass(frozen=True, slots=True)
class RatingWalkConfig:
    floor: float = 4.0
    ceil: float = 9.7
    mean: float = 6.5  # gentle mean-reversion target
    revert: float = 0.05  # pull toward the mean each step
    noise_sd: float = 0.12  # per-step gaussian noise
    goal_bump: float = 1.3
    assist_bump: float = 0.6
    yellow_bump: float = -0.5
    red_bump: float = -1.6
    miss_bump: float = -0.9


DEFAULT_WALK = RatingWalkConfig()


def event_bump(event_type: str | None, config: RatingWalkConfig = DEFAULT_WALK) -> float:
    """Synthetic rating nudge for a real archived event type. Unknown /
    None ⇒ 0 (the walk just continues)."""
    match event_type:
        case "goal" | "penalty":
            return config.goal_bump
        case "assist":
            return config.assist_bump
        case "yellow_card":
            return config.yellow_bump
        case "red_card" | "yellow_red_card":
            return config.red_bump
        case "penalty_missed" | "own_goal":
            return config.miss_bump
        case _:
            return 0.0


def next_rating(prev: float, *, rng: Random, bump: float = 0.0, config: RatingWalkConfig = DEFAULT_WALK) -> float:
    """One step of a bounded mean-reverting random walk + an optional
    event bump. Pure given ``rng``; result is clamped to [floor, ceil]."""
    drift = (config.mean - prev) * config.revert
    step = drift + rng.gauss(0.0, config.noise_sd) + bump
    return max(config.floor, min(config.ceil, prev + step))
