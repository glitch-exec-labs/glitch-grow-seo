"""
Search Console API wrapper. Uses the google-api-python-client SDK for
paginated searchanalytics queries — rolling our own pagination is
strictly worse.
"""
from __future__ import annotations

from typing import Any

from googleapiclient.errors import HttpError

from .auth import build_service


def client():
    return build_service("searchconsole", "v1", "search_console")


def list_properties() -> list[dict[str, Any]]:
    """Every property this SA can see. Useful for IAM probing."""
    svc = client()
    try:
        resp = svc.sites().list().execute()
        return list(resp.get("siteEntry") or [])
    except HttpError as e:
        raise SearchConsoleError(f"sites.list failed: {e}") from e


def query(
    property_uri: str,
    *,
    start_date: str,
    end_date: str,
    dimensions: list[str],
    row_limit: int = 500,
) -> list[dict[str, Any]]:
    """
    Raw searchanalytics.query. Returns the `rows` array untouched.
    Callers in pulls/gsc.py shape this into typed dicts.
    """
    svc = client()
    body = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": dimensions,
        "rowLimit": row_limit,
    }
    try:
        resp = (
            svc.searchanalytics()
            .query(siteUrl=property_uri, body=body)
            .execute()
        )
    except HttpError as e:
        raise SearchConsoleError(
            f"searchanalytics.query failed for {property_uri}: {e}"
        ) from e
    return list(resp.get("rows") or [])


class SearchConsoleError(RuntimeError):
    """Raised on any Google API error we want callers to distinguish."""
