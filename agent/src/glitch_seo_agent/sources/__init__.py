"""
Site sources — the Python agent's multi-platform onramp.

A `SiteRecord` is what every downstream pull consumes. Any platform
that wants to be audited must expose a source loader that yields
`SiteRecord` instances — today: fleet.json, Shopify sessions, and the
HTML/Wix SiteConnection table (stub).

The registry composes all sources and dedupes on `id`. Adding a new
platform = one new source loader; pulls/reports stay identical.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SiteRecord:
    """Platform-agnostic site enrollment record consumed by every pull."""

    id: str
    platform: str  # "astro" | "shopify" | "html" | "wix"
    base_url: str
    gsc_property: str | None = None
    psi_targets: list[str] = field(default_factory=list)
    nlp_targets: list[str] = field(default_factory=list)
    enabled: bool = True
    notes: str | None = None

    def display_name(self) -> str:
        return f"{self.id} ({self.platform})"


from .registry import all_enabled_sites, get_site  # noqa: E402

__all__ = ["SiteRecord", "all_enabled_sites", "get_site"]
