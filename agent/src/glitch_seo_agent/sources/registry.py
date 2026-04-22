"""
registry — composes every source into one deduplicated stream of
SiteRecord. The rest of the pipeline never talks to sources directly.
"""
from __future__ import annotations

from . import SiteRecord, fleet_source, shopify_source, site_conn_source


async def all_enabled_sites() -> list[SiteRecord]:
    seen: dict[str, SiteRecord] = {}

    # fleet_source is sync (reads a local file) — call directly
    for r in fleet_source.load():
        if not r.enabled:
            continue
        seen.setdefault(r.id, r)

    for r in await shopify_source.load():
        if not r.enabled:
            continue
        seen.setdefault(r.id, r)

    for r in await site_conn_source.load():
        if not r.enabled:
            continue
        seen.setdefault(r.id, r)

    return list(seen.values())


async def get_site(site_id: str) -> SiteRecord | None:
    for s in await all_enabled_sites():
        if s.id == site_id:
            return s
    return None
