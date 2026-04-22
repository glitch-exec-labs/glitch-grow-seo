"""
site_conn_source — placeholder for future HTML/Wix registrations via
the SiteConnection table. Emits nothing today; included so the
registry has a stable three-source shape.
"""
from __future__ import annotations

from collections.abc import Iterable

from . import SiteRecord


async def load() -> Iterable[SiteRecord]:
    return []
