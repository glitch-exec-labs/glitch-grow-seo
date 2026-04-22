"""
fleet_source — loads SiteRecord objects from fleet.json.

Parses the SAME file the Node app reads, so there is one source of truth
for fleet config. Astro sites are treated as platform "astro"; the html
connector handles them but the signal pulls don't care.
"""
from __future__ import annotations

import json
from collections.abc import Iterable

from ..config import settings
from . import SiteRecord


def load() -> Iterable[SiteRecord]:
    path = settings().fleet_config_path
    if not path.exists():
        return []

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(raw, list):
        return []

    out: list[SiteRecord] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        site_id = str(entry.get("id") or "").strip()
        base_url = str(entry.get("baseUrl") or "").strip().rstrip("/")
        if not site_id or not base_url:
            continue
        out.append(
            SiteRecord(
                id=site_id,
                platform=str(entry.get("platform") or "html"),
                base_url=base_url,
                gsc_property=entry.get("gscProperty") or _default_gsc_property(base_url),
                psi_targets=list(entry.get("psiTargets") or []),
                nlp_targets=list(entry.get("nlpTargets") or []),
                brand_queries=list(entry.get("brandQueries") or []),
                enabled=bool(entry.get("enabled", True)),
                notes=entry.get("notes"),
            )
        )
    return out


def _default_gsc_property(base_url: str) -> str:
    """
    Without an explicit gscProperty in fleet.json we default to the
    URL-prefix form of the base URL. Merchants with domain-property
    verification (`sc-domain:…`) should override explicitly.
    """
    u = base_url.rstrip("/")
    return u + "/"
