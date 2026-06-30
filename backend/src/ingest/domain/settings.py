"""Tunable knobs of the ingest bounded context.

DDD role: Configuration (read-only Value Object). Every operational
frequency, window, and concurrency bound that an operator might want
to change without redeploying code is declared here, with sane
defaults grounded in the Sportmonks API best-practice guide
(``/livescores/latest`` updates on a 10s cycle).

Override via environment variables — for example:

    INGEST_INPLAY_POLL_SECONDS=5
    INGEST_NEWS_POLL_SECONDS=120

Or via ``.env``. Re-read by restarting the ingest worker; no in-process
hot-reload (intentional — frequency changes are not hot-path).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class IngestionSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="INGEST_", env_file=".env", extra="ignore")

    # ----- Inplay poller (per active fixture) -----------------------------
    # How often each per-fixture poller hits Sportmonks. 10s is Sportmonks'
    # own recommendation: their /livescores/latest cycles on that period.
    inplay_poll_seconds: float = 10.0
    # How long BEFORE kickoff the fixture's poller is spawned. Lineups are
    # typically published ~1h before kickoff, so the default catches them.
    inplay_pre_kickoff_window_min: int = 60
    # How long AFTER FT the poller keeps running to catch late stats
    # corrections.
    inplay_post_ft_window_min: int = 15
    # Hard upper bound on the in-game duration we'll poll a fixture for,
    # in case the FT status is never observed (network glitch, etc.).
    # MUST cover the worst case: a knockout decided on penalties, measured from
    # kickoff to FT_PEN — 90' + stoppage + 15' HT + 30' extra time + the breaks
    # before/between ET halves and before the shootout + the shootout itself
    # ≈ 185-195 min (observed live on WC2026 R32: Germany-Paraguay reached
    # EXTRA_TIME_BREAK at kickoff+143', Netherlands-Morocco INPLAY_ET 108' at
    # kickoff+142'). The previous 130' closed the window (kickoff+145' with
    # post_ft) DURING extra time, so the poller was reaped before FT and those
    # matches never settled. 210' gives ~15' headroom past the worst case.
    inplay_max_match_duration_min: int = 210

    # ----- Side pollers ---------------------------------------------------
    standings_poll_seconds: float = 300.0  # 5 min
    news_poll_seconds: float = 900.0  # 15 min
    reference_refresh_seconds: float = 86400.0  # 24 h
    # How often the live pricing worker drains newly-ingested match events
    # into price ticks. Small (events arrive ~10s from the InplayPoller).
    pricing_poll_seconds: float = 5.0

    # ----- Supervisor cadence --------------------------------------------
    # How often the supervisor checks the fixture list and decides which
    # pollers to spawn/kill. Light operation; 30s is plenty.
    scheduler_check_seconds: float = 30.0

    # ----- Concurrency bounds --------------------------------------------
    # Hard cap on parallel inplay pollers. WC stage day = at most 4 matches
    # simultaneously; default of 8 is comfortable.
    max_concurrent_inplay_pollers: int = 8
    http_pool_size: int = 32

    # ----- Pub/sub bus ---------------------------------------------------
    # NATS server URL(s). Comma-separated for cluster mode (later).
    nats_servers: str = "nats://localhost:4222"

    @property
    def nats_server_list(self) -> tuple[str, ...]:
        return tuple(s.strip() for s in self.nats_servers.split(",") if s.strip())
