"""
Custom Search JSON API — v2 skeleton.

Needs a CSE engine id (one-time per account configuration) plus an
API key. We'll wire this in v2 for SERP snapshotting of brand queries.
"""
from __future__ import annotations


class CustomSearchDisabled(RuntimeError):
    pass


async def search(_query: str) -> dict:
    raise CustomSearchDisabled("Custom Search disabled in v1. Defer to v2.")
