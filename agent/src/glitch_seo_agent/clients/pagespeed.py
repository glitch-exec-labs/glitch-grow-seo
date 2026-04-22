"""
PageSpeed Insights — public HTTPS endpoint, returns Lighthouse result
plus Core Web Vitals field data. We call it via httpx rather than the
SDK; the SDK surface is ugly and the REST shape is trivial.

No auth required for public URLs when an API key is supplied; using the
SA token also works but the /runPagespeed endpoint is the one everyone
uses. We send no key — the unkeyed quota is fine for a daily 4-site run.
Add a key later if we ever hit quota.
"""
from __future__ import annotations

import os

import httpx

_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
_TIMEOUT = httpx.Timeout(90.0, connect=10.0)


async def audit(
    url: str,
    *,
    strategy: str = "mobile",
    categories: tuple[str, ...] = ("performance", "seo"),
) -> dict:
    """
    One PSI run. `strategy` ∈ {"mobile", "desktop"}. Returns the full
    JSON body — callers downstream pull out Lighthouse scores + CrUX
    field data.

    Unkeyed calls are fine for a daily 4-site cron but burst during
    probing hits 429. Set PAGESPEED_API_KEY to get the higher quota
    (25,000 queries per day).
    """
    params: list[tuple[str, str]] = [
        ("url", url),
        ("strategy", strategy),
    ]
    for cat in categories:
        params.append(("category", cat))

    api_key = os.environ.get("PAGESPEED_API_KEY")
    if api_key:
        params.append(("key", api_key))

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.get(_BASE, params=params)
    res.raise_for_status()
    return res.json()
