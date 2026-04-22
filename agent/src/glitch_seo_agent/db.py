"""
db — asyncpg pool + typed writers. Prisma owns the schema; we only
read/write.
"""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import asyncpg

from .config import settings


def _asyncpg_dsn(prisma_url: str) -> str:
    """
    Prisma's DATABASE_URL often carries `?schema=public` which Postgres
    itself (and therefore asyncpg) rejects as an unknown parameter.
    Strip any non-PG params so asyncpg accepts the DSN.
    """
    parsed = urlparse(prisma_url)
    if not parsed.query:
        return prisma_url
    allowed_keys = {
        "sslmode", "sslcert", "sslkey", "sslrootcert",
        "application_name", "options", "connect_timeout",
    }
    kept = [(k, v) for k, v in parse_qsl(parsed.query) if k in allowed_keys]
    new_query = urlencode(kept)
    return urlunparse(parsed._replace(query=new_query))

_pool: asyncpg.Pool | None = None


async def sync_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=_asyncpg_dsn(settings().database_url),
            min_size=1,
            max_size=4,
            command_timeout=30,
        )
        assert _pool is not None
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


# -- SeoReport writer --------------------------------------------------

async def insert_seo_report(
    *,
    site_id: str,
    platform: str,
    period: str,
    kind: str,
    summary: dict[str, Any],
    gsc: dict[str, Any] | None = None,
    perf: dict[str, Any] | None = None,
    entities: dict[str, Any] | None = None,
    indexing: dict[str, Any] | None = None,
    serp: dict[str, Any] | None = None,
    error: str | None = None,
) -> str:
    """Returns the new row's id."""
    pool = await sync_pool()
    async with pool.acquire() as conn:
        row_id = await conn.fetchval(
            """
            INSERT INTO "SeoReport"
              (id, "siteId", platform, period, kind, summary,
               gsc, perf, entities, indexing, serp, error)
            VALUES
              ('r_' || replace(gen_random_uuid()::text, '-', ''),
               $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11)
            RETURNING id
            """,
            site_id,
            platform,
            period,
            kind,
            json.dumps(summary),
            json.dumps(gsc) if gsc is not None else None,
            json.dumps(perf) if perf is not None else None,
            json.dumps(entities) if entities is not None else None,
            json.dumps(indexing) if indexing is not None else None,
            json.dumps(serp) if serp is not None else None,
            error,
        )
    return str(row_id)
