"""
Daily report — orchestrates GSC + PSI + NLP pulls, writes SeoReport.

Platform-agnostic: every SiteRecord goes through the same pipeline.
Deterministic output shape so the Node UI can render generically.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from ..config import settings
from ..db import insert_seo_report
from ..pulls import entities as entities_pull
from ..pulls import gsc as gsc_pull
from ..pulls import perf as perf_pull
from ..pulls import serp as serp_pull
from ..sources import SiteRecord

log = structlog.get_logger(__name__)


async def run(site: SiteRecord) -> dict[str, Any]:
    started = datetime.now(UTC)
    log.info("daily_report.start", site=site.id, platform=site.platform)

    gsc = gsc_pull.pull(site)
    top_page_urls = [r["page"] for r in (gsc.get("top_pages") or []) if r.get("page")]

    perf = await perf_pull.pull(site, fallback_urls=top_page_urls)
    entities = await entities_pull.pull(site, fallback_urls=top_page_urls)
    serp = await serp_pull.pull(site)

    summary = _summarize(gsc=gsc, perf=perf, entities=entities)

    row_id = await insert_seo_report(
        site_id=site.id,
        platform=site.platform,
        period="28d",
        kind="daily",
        summary=summary,
        gsc=gsc,
        perf=perf,
        entities=entities,
        serp=serp,
    )

    # Drop an on-disk JSON snapshot for drill-down / audit trail.
    snapshot_path = _snapshot_path(site.id, started)
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(
        json.dumps(
            {
                "id": row_id,
                "siteId": site.id,
                "platform": site.platform,
                "ranAt": started.isoformat(),
                "summary": summary,
                "gsc": gsc,
                "perf": perf,
                "entities": entities,
                "serp": serp,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    log.info(
        "daily_report.done",
        site=site.id,
        row_id=row_id,
        duration_s=(datetime.now(UTC) - started).total_seconds(),
        summary=summary,
    )
    return {"id": row_id, "siteId": site.id, "summary": summary}


def _summarize(
    *,
    gsc: dict[str, Any],
    perf: dict[str, Any],
    entities: dict[str, Any],
) -> dict[str, Any]:
    totals = gsc.get("totals") or {}
    top_entities = entities.get("top_entities") or []
    return {
        "clicks": int(totals.get("clicks", 0)),
        "impressions": int(totals.get("impressions", 0)),
        "avg_ctr": round(float(totals.get("ctr", 0.0)), 6),
        "avg_position": round(float(totals.get("position", 0.0)), 3),
        "psi_median_performance": (perf.get("median") or {}).get("performance"),
        "psi_sample_size": (perf.get("median") or {}).get("sample_size", 0),
        "top_entities": [e["name"] for e in top_entities[:10]],
        "has_errors": bool(gsc.get("error") or perf.get("error") or entities.get("error")),
    }


def _snapshot_path(site_id: str, ts: datetime) -> Path:
    root = settings().reports_dir
    day = ts.date().isoformat()
    hm = ts.strftime("%H%M%S")
    return root / site_id / f"{day}_{hm}.json"
