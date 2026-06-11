from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Sentinel default for the JWT secret. Only acceptable when APP_ENV=dev.
# get_settings() refuses to boot with this value in any other environment.
DEV_JWT_SECRET = "dev-only-change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Deployment environment. ``dev`` enables local conveniences (default
    # JWT secret, non-secure cookie); anything else is treated as a real
    # deployment and tightens those (see get_settings / auth cookie).
    app_env: str = Field(default="dev")
    database_url: str = Field(default="postgresql+asyncpg://fundxi:fundxi@localhost:5432/fundxi")
    sportmonks_api_token: str = Field(default="")
    sportmonks_base_url: str = Field(default="https://api.sportmonks.com/v3/football")
    # The Sportmonks season_id we currently bootstrap. WC2022 during dev,
    # WC2026 once the tournament starts. Same pipeline either way.
    active_season_id: int = Field(default=0)
    # Cash (in €M) granted to a brand-new user portfolio. No default — must be
    # set explicitly via INITIAL_CASH env var so we don't ship a magic value.
    initial_cash: float = Field(default=0.0)
    # JWT signing secret. MUST be set via the ``JWT_SECRET`` env var outside
    # dev — get_settings() fails fast if the default is left in place.
    jwt_secret: str = Field(default=DEV_JWT_SECRET)
    log_level: str = Field(default="INFO")
    # Password-reset flow. ``resend_api_key`` empty (or dev) ⇒ emails are
    # logged to the console instead of sent (see email.build_sender).
    # ``app_base_url`` is the public origin used to build the reset link
    # (e.g. https://app.fundxi.io). ``email_from`` is the verified Resend
    # sender address.
    resend_api_key: str = Field(default="")
    email_from: str = Field(default="fundXI <no-reply@fundxi.local>")
    app_base_url: str = Field(default="http://localhost:5173")
    password_reset_ttl_seconds: int = Field(default=60 * 60)  # 1 hour
    # Error tracking. Empty ⇒ Sentry is not initialised (no-op), so local dev
    # and tests stay offline. Set ``SENTRY_DSN`` in prod to enable reporting.
    sentry_dsn: str = Field(default="")
    # Buying-power limit: gross exposure (longs + shorts) may not exceed equity
    # times this factor. 1.0 = no leverage (the total size of all positions can
    # never exceed the portfolio's own money); shorting stays allowed but bounded
    # by capital. See domain/portfolio/margin.py.
    # NOTE: this headroom applies to SHORTS only. Longs are cash-only by design —
    # a buy beyond free cash is rejected in execute_trade regardless of this
    # factor (no margin borrowing on longs). Setting > 1 enlarges short capacity,
    # not long capacity.
    max_gross_leverage: float = Field(default=1.0)

    @property
    def is_dev(self) -> bool:
        return self.app_env.lower() == "dev"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.is_dev and settings.jwt_secret == DEV_JWT_SECRET:
        # Fail-fast: a real deployment signing tokens with the public,
        # source-controlled dev secret lets anyone forge a session for any
        # user. Refuse to boot instead of silently using it.
        raise RuntimeError(
            "JWT_SECRET must be set to a non-default value when APP_ENV is not 'dev'"
        )
    return settings
