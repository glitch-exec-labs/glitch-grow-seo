"""
shopify_source — yields one SiteRecord per installed Shopify shop.

Joins the Session table (auth state) with ClientMemory
(gscProperty / psiTargets / nlpTargets set by the merchant via the
admin UI at /app/client-memory).
"""
from __future__ import annotations

from collections.abc import Iterable

from ..db import sync_pool
from . import SiteRecord


async def load() -> Iterable[SiteRecord]:
    pool = await sync_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
              s.shop                 AS site_id,
              cm."gscProperty"       AS gsc_property,
              cm."psiTargets"        AS psi_targets,
              cm."nlpTargets"        AS nlp_targets,
              cm."brandQueries"      AS brand_queries
            FROM (SELECT DISTINCT shop FROM "Session") s
            LEFT JOIN "ClientMemory" cm ON cm."siteId" = s.shop
            ORDER BY s.shop ASC
            """
        )
    out: list[SiteRecord] = []
    for r in rows:
        shop = r["site_id"]
        out.append(
            SiteRecord(
                id=shop,
                platform="shopify",
                base_url=f"https://{shop}",
                gsc_property=r["gsc_property"],
                psi_targets=list(r["psi_targets"] or []),
                nlp_targets=list(r["nlp_targets"] or []),
                brand_queries=list(r["brand_queries"] or []),
                enabled=True,
                notes=None,
            )
        )
    return out
