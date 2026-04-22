"""
PageSpeed Insights pull for a site's top URLs.

URL source priority:
  1. site.psi_targets — explicit override in fleet.json / ClientMemory
  2. top N pages from the GSC pull (passed in as `fallback_urls`)
  3. just the base_url

Returns per-URL summary + an aggregate median.
"""
from __future__ import annotations

from collections.abc import Iterable
from statistics import median
from typing import Any

import httpx

from ..clients.pagespeed import audit
from ..sources import SiteRecord

TOP_N = 10


async def pull(site: SiteRecord, *, fallback_urls: Iterable[str] = ()) -> dict[str, Any]:
    urls = _resolve_urls(site, fallback_urls)
    if not urls:
        return {"error": "no_urls", "audits": [], "median": None}

    audits: list[dict[str, Any]] = []
    for url in urls[:TOP_N]:
        try:
            result = await audit(url, strategy="mobile")
            audits.append(_summarize(url, result))
        except httpx.HTTPError as e:
            audits.append({"url": url, "error": str(e)})

    perf_scores = [a.get("scores", {}).get("performance") for a in audits]
    perf_scores = [s for s in perf_scores if isinstance(s, (int, float))]

    return {
        "strategy": "mobile",
        "audits": audits,
        "median": {
            "performance": round(median(perf_scores), 3) if perf_scores else None,
            "sample_size": len(perf_scores),
        },
    }


def _resolve_urls(site: SiteRecord, fallback_urls: Iterable[str]) -> list[str]:
    if site.psi_targets:
        return [u for u in site.psi_targets if u]
    fbs = [u for u in fallback_urls if u]
    if fbs:
        return fbs
    return [site.base_url]


def _summarize(url: str, psi: dict[str, Any]) -> dict[str, Any]:
    lh = (psi.get("lighthouseResult") or {})
    cats = lh.get("categories") or {}
    audits_root = lh.get("audits") or {}

    def cat_score(name: str) -> float | None:
        c = cats.get(name) or {}
        s = c.get("score")
        return float(s) if isinstance(s, (int, float)) else None

    def audit_numeric(name: str) -> float | None:
        a = audits_root.get(name) or {}
        v = a.get("numericValue")
        return float(v) if isinstance(v, (int, float)) else None

    return {
        "url": url,
        "scores": {
            "performance": cat_score("performance"),
            "seo": cat_score("seo"),
        },
        "metrics": {
            "lcp_ms": audit_numeric("largest-contentful-paint"),
            "cls": audit_numeric("cumulative-layout-shift"),
            "tbt_ms": audit_numeric("total-blocking-time"),
            "fcp_ms": audit_numeric("first-contentful-paint"),
            "ttfb_ms": audit_numeric("server-response-time"),
        },
    }
