"""
Indexing API — v2 skeleton.

Scaffold only. Enabling this requires the SA to be added as an *Owner*
on each Search Console property (stricter than 'Full User' for GSC
reads). Left unwired in v1 so we don't silently 403.
"""
from __future__ import annotations


class IndexingApiDisabled(RuntimeError):
    """Raised any time we try to use the Indexing API before v2."""


async def submit_url_updated(_url: str) -> None:
    raise IndexingApiDisabled("Indexing API disabled in v1. Defer to v2.")


async def submit_url_deleted(_url: str) -> None:
    raise IndexingApiDisabled("Indexing API disabled in v1. Defer to v2.")
