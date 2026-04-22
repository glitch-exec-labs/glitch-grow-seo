"""
SERP snapshot via Google Custom Search.

For each enrolled brand query, fetch the top-10 results. If the site
has no explicit brand queries, derive a small default set from the
siteId + base URL (exact brand match, brand + review, and the raw
domain). Lets the agent track week-to-week whether the site still
ranks on its own brand.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from ..clients.custom_search import search
from ..sources import SiteRecord

MAX_QUERIES = 6


async def pull(site: SiteRecord) -> dict[str, Any]:
    queries = site.brand_queries or _default_brand_queries(site)
    if not queries:
        return {"queries": [], "error": "no_queries"}
    results: list[dict[str, Any]] = []
    for q in queries[:MAX_QUERIES]:
        results.append(await search(q))
    return {"queries": results}


def _default_brand_queries(site: SiteRecord) -> list[str]:
    """Cheap defaults when the operator hasn't enrolled queries."""
    out: list[str] = []
    # Use the site's short id as the brand stub — "grow-site" → "grow site".
    brand = site.id.replace("-", " ").replace("_", " ").strip()
    if brand:
        out.append(brand)
        out.append(f"{brand} review")
    # Raw domain also worth tracking.
    host = urlparse(site.base_url).netloc
    if host and host not in out:
        out.append(host)
    return out
