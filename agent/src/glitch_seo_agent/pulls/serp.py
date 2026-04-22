"""
SERP snapshot via Google Custom Search — NOT WIRED in v1.

Google deprecated the "Search the entire web" feature on new
Programmable Search Engines, so Custom Search JSON can now only query
a caller-supplied list of sites. That defeats the original goal
(track where our brand ranks across the open web); GSC top_queries
already gives us the same signal for our own properties.

Kept as scaffolding:
- If you decide to track a specific list of competitor domains, add
  them to your Programmable Search Engine and wire this pull into
  reports/daily.py again.
- If you sign up for a paid SERP provider (SerpAPI, ValueSERP,
  DataForSEO), swap clients/custom_search.py for the provider's SDK
  and the rest of this module is shaped correctly.

Not called by the daily report in v1.
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
