"""
Config — pydantic-settings. Single source of truth for environment.

Reads the same .env the Node app uses (DATABASE_URL, etc.) plus our own
Python-only knobs. Nothing here touches Google / Shopify at import time.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the repo root deterministically — this file is at
# agent/src/glitch_seo_agent/config.py, so repo root is parents[3].
_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """
    Environment-driven config. `.env` is loaded from the repo root; any
    var can be overridden at process launch.
    """

    # --- Database (shared with Node app) --------------------------------
    database_url: str = Field(..., alias="DATABASE_URL")

    # --- Google auth ----------------------------------------------------
    google_sa_path: Path = Field(
        default=_REPO_ROOT / "credentials" / "google-sa.json",
        alias="GOOGLE_SA_PATH",
    )

    # --- PageSpeed Insights --------------------------------------------
    # Optional — unkeyed quota is fine for daily cron across a small
    # fleet but 429s under burst. Passed to `?key=…` query param when set.
    pagespeed_api_key: str | None = Field(default=None, alias="PAGESPEED_API_KEY")

    # --- Fleet (shared with Node app) -----------------------------------
    fleet_config_path: Path = Field(
        default=_REPO_ROOT / "fleet.json",
        alias="FLEET_CONFIG_PATH",
    )

    # --- Run mode -------------------------------------------------------
    # Mirrors Node's AGENT_LLM_MODE — Python has no LLM calls in v1, but
    # future synthesis steps will gate on this.
    agent_llm_mode: str = Field(default="off", alias="AGENT_LLM_MODE")

    # Drop a JSON snapshot alongside the DB write for debugging / audit.
    reports_dir: Path = Field(
        default=_REPO_ROOT / "agent" / ".reports",
        alias="AGENT_REPORTS_DIR",
    )

    model_config = SettingsConfigDict(
        env_file=_REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def repo_root(self) -> Path:
        return _REPO_ROOT


@lru_cache(maxsize=1)
def settings() -> Settings:
    """Singleton access. Call once, reuse."""
    return Settings()  # type: ignore[call-arg]
