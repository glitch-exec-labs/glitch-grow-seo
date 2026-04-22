"""
Google Custom Search JSON API — SERP snapshotting.

Needs:
  CUSTOM_SEARCH_API_KEY   — any unrestricted API key with CSE access
                            (can reuse PAGESPEED_API_KEY if you scope
                            it to both APIs instead of one)
  CUSTOM_SEARCH_ENGINE_ID — id of a Programmable Search Engine you
                            create at https://programmablesearchengine.google.com/cse/create

Fail-open: when either is missing, search() returns an error marker
instead of raising, so the daily report stays cheap + composable.
"""
from __future__ import annotations

from typing import Any

import httpx

from ..config import settings

_BASE = "https://www.googleapis.com/customsearch/v1"
_TIMEOUT = httpx.Timeout(15.0, connect=5.0)


async def search(query: str, *, num: int = 10) -> dict[str, Any]:
    s = settings()
    key = s.custom_search_api_key or s.pagespeed_api_key  # reuse if same key
    cx = s.custom_search_engine_id
    if not key or not cx:
        return {
            "query": query,
            "error": "disabled — set CUSTOM_SEARCH_API_KEY and CUSTOM_SEARCH_ENGINE_ID",
        }

    params = {"key": key, "cx": cx, "q": query, "num": max(1, min(10, num))}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.get(_BASE, params=params)
    if res.status_code >= 400:
        return {"query": query, "error": f"HTTP {res.status_code}: {res.text[:200]}"}
    body = res.json()
    items = body.get("items") or []
    return {
        "query": query,
        "total_results": int((body.get("searchInformation") or {}).get("totalResults") or 0),
        "results": [
            {
                "title": it.get("title"),
                "link": it.get("link"),
                "displayLink": it.get("displayLink"),
                "snippet": it.get("snippet"),
            }
            for it in items
        ],
    }
