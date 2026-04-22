"""
Search Console 28-day pull.

Returns a structured dict:
  {
    period: "28d",
    totals: {clicks, impressions, ctr, position},
    top_queries: [{query, clicks, impressions, ctr, position}, ...],
    top_pages:   [{page,  clicks, impressions, ctr, position}, ...],
  }

Date math: end = yesterday (GSC is always 2–3 days lagged; query end=today
returns empty on most properties). start = end - 27 days.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from ..clients.search_console import SearchConsoleError, query
from ..sources import SiteRecord

TOP_N_QUERIES = 25
TOP_N_PAGES = 25


def pull(site: SiteRecord) -> dict[str, Any]:
    if not site.gsc_property:
        return {"error": "no_gsc_property", "period": "28d"}

    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=27)
    start_s, end_s = start.isoformat(), end.isoformat()

    try:
        totals_rows = query(
            site.gsc_property,
            start_date=start_s,
            end_date=end_s,
            dimensions=[],
            row_limit=1,
        )
        queries = query(
            site.gsc_property,
            start_date=start_s,
            end_date=end_s,
            dimensions=["query"],
            row_limit=TOP_N_QUERIES,
        )
        pages = query(
            site.gsc_property,
            start_date=start_s,
            end_date=end_s,
            dimensions=["page"],
            row_limit=TOP_N_PAGES,
        )
    except SearchConsoleError as e:
        return {"error": str(e), "period": "28d"}

    totals = _first_or_zero(totals_rows)
    return {
        "period": "28d",
        "window": {"start": start_s, "end": end_s},
        "totals": {
            "clicks": totals.get("clicks", 0),
            "impressions": totals.get("impressions", 0),
            "ctr": round(float(totals.get("ctr", 0.0)), 6),
            "position": round(float(totals.get("position", 0.0)), 3),
        },
        "top_queries": [_shape_row(r, key="query") for r in queries],
        "top_pages": [_shape_row(r, key="page") for r in pages],
    }


def _first_or_zero(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return rows[0] if rows else {"clicks": 0, "impressions": 0, "ctr": 0.0, "position": 0.0}


def _shape_row(row: dict[str, Any], *, key: str) -> dict[str, Any]:
    keys = row.get("keys") or []
    return {
        key: keys[0] if keys else None,
        "clicks": row.get("clicks", 0),
        "impressions": row.get("impressions", 0),
        "ctr": round(float(row.get("ctr", 0.0)), 6),
        "position": round(float(row.get("position", 0.0)), 3),
    }
