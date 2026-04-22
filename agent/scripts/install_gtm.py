#!/usr/bin/env python3
"""
install_gtm — directly injects Google Tag Manager snippets into each
brand store's published theme.liquid via the Shopify Admin Asset API.

Follows the operational pattern from /home/support/glitch-grow-ads-agent
(documented by the operator): resolve slug → shop_domain via STORES_JSON,
pull token from the multi-store-theme-manager Postgres DB, check scope,
backup, inject, PUT, verify-with-retry (Shopify's asset cache lags by
2–5 s on write).

Idempotent: if the target GTM container id is already in theme.liquid,
the shop is skipped. Safe to re-run.

Usage:
    install_gtm.py                  # inject GTM on all four brand stores
    install_gtm.py --slug storico   # only one
    install_gtm.py --dry-run        # report what would change, no writes

Also clears the shop metafield glitch_grow_seo.gtm_container_id on
successful inject so the theme-app-embed block (which emits the same
snippets when that metafield is set) cannot double-fire.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

import asyncpg
import httpx
from dotenv import load_dotenv

API_VERSION = "2024-10"

# Brand → GTM container id. Keep this tight: one row per brand we own.
GTM_BY_SLUG: dict[str, str] = {
    "classicoo": "GTM-PFVB9BMC",
    "urban": "GTM-5SSC7Q4P",
    "trendsetters": "GTM-NXMT88BB",
    "storico": "GTM-PR3RFMCX",
}

MARKER = "<!-- glitch-grow-seo: GTM installed via install_gtm.py -->"


def gtm_head_block(gtm_id: str) -> str:
    return (
        f"\n    {MARKER}\n"
        f"    <!-- Google Tag Manager -->\n"
        f"    <script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{'gtm.start':\n"
        f"    new Date().getTime(),event:'gtm.js'}});var f=d.getElementsByTagName(s)[0],\n"
        f"    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n"
        f"    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n"
        f"    }})(window,document,'script','dataLayer','{gtm_id}');</script>\n"
        f"    <!-- End Google Tag Manager -->"
    )


def gtm_body_block(gtm_id: str) -> str:
    return (
        f"\n    <!-- Google Tag Manager (noscript) -->\n"
        f"    <noscript><iframe src=\"https://www.googletagmanager.com/ns.html?id={gtm_id}\"\n"
        f"    height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"></iframe></noscript>\n"
        f"    <!-- End Google Tag Manager (noscript) -->"
    )


# ── DB helpers ──────────────────────────────────────────────────────

def _read_theme_manager_dsn() -> str:
    with open("/home/support/multi-store-theme-manager/.env") as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                dsn = line.split("=", 1)[1].strip().strip('"')
                return dsn.split("?")[0]
    raise RuntimeError("DATABASE_URL not found in multi-store-theme-manager/.env")


def _read_our_dsn() -> str:
    load_dotenv("/home/support/glitch-grow-public/.env")
    return os.environ["DATABASE_URL"].split("?")[0]


async def get_token(conn: asyncpg.Connection, shop: str) -> tuple[str, str]:
    row = await conn.fetchrow(
        'SELECT "accessToken" AS t, scope FROM "Session" WHERE shop=$1 LIMIT 1',
        shop,
    )
    if not row:
        raise RuntimeError(f"no Session row for {shop}")
    return row["t"], row["scope"] or ""


# ── Shopify helpers ────────────────────────────────────────────────

async def rest(
    client: httpx.AsyncClient,
    shop: str,
    token: str,
    path: str,
    method: str = "GET",
    body: dict | None = None,
) -> dict:
    url = f"https://{shop}/admin/api/{API_VERSION}/{path}"
    headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
    r = await client.request(method, url, headers=headers, json=body, timeout=30.0)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {path} → {r.status_code} {r.text[:500]}")
    return r.json()


async def gql(
    client: httpx.AsyncClient, shop: str, token: str, query: str, variables: dict | None = None,
) -> dict:
    url = f"https://{shop}/admin/api/{API_VERSION}/graphql.json"
    headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
    r = await client.post(url, headers=headers, json={"query": query, "variables": variables or {}}, timeout=30.0)
    return r.json()


async def clear_gtm_metafield(client: httpx.AsyncClient, shop: str, token: str) -> None:
    """
    Delete glitch_grow_seo.gtm_container_id on the shop so the theme
    app embed block (which also emits GTM when that field is set)
    cannot double-fire alongside our direct theme injection.
    """
    body = await gql(client, shop, token, """
        {
          shop { id metafield(namespace:"glitch_grow_seo", key:"gtm_container_id") { id } }
        }
    """)
    mf = (((body.get("data") or {}).get("shop") or {}).get("metafield") or {})
    mf_id = mf.get("id")
    if not mf_id:
        return
    await gql(client, shop, token,
              "mutation($id: ID!){ metafieldDelete(input:{id:$id}){ deletedId userErrors{message} } }",
              {"id": mf_id})


# ── Injection pipeline ─────────────────────────────────────────────

async def install_one(
    client: httpx.AsyncClient,
    slug: str,
    shop: str,
    gtm_id: str,
    token: str,
    scope_csv: str,
    dry_run: bool,
) -> dict:
    result: dict = {"slug": slug, "shop": shop, "gtm_id": gtm_id}
    if "write_themes" not in scope_csv:
        result["status"] = "skipped"
        result["reason"] = "missing_write_themes_scope"
        return result

    themes = (await rest(client, shop, token, "themes.json"))["themes"]
    main = next((t for t in themes if t["role"] == "main"), None)
    if not main:
        result["status"] = "skipped"
        result["reason"] = "no_main_theme"
        return result
    theme_id = main["id"]
    result["theme_id"] = theme_id
    result["theme_name"] = main.get("name")

    asset = (
        await rest(client, shop, token, f"themes/{theme_id}/assets.json?asset[key]=layout/theme.liquid")
    )["asset"]
    src = asset["value"]
    result["before_bytes"] = len(src)

    # Idempotency — our marker + GTM id already present? Skip.
    already_present = MARKER in src or f"'script','dataLayer','{gtm_id}'" in src
    if already_present:
        result["status"] = "already_installed"
        return result

    head_m = re.search(r"<head\b[^>]*>", src, flags=re.IGNORECASE)
    body_m = re.search(r"<body\b[^>]*>", src, flags=re.IGNORECASE)
    if not head_m or not body_m:
        result["status"] = "skipped"
        result["reason"] = "no_head_or_body_tag"
        return result

    # Insert in reverse offset order so earlier indexes stay stable.
    new_src = src
    new_src = new_src[: body_m.end()] + gtm_body_block(gtm_id) + new_src[body_m.end() :]
    new_src = new_src[: head_m.end()] + gtm_head_block(gtm_id) + new_src[head_m.end() :]
    result["after_bytes"] = len(new_src)

    if dry_run:
        result["status"] = "dry_run"
        return result

    # Backup the ORIGINAL before writing.
    ts = int(time.time())
    bak = Path(f"/tmp/theme_{shop}_{ts}.bak.liquid")
    bak.write_text(src)
    result["backup"] = str(bak)

    await rest(
        client, shop, token,
        f"themes/{theme_id}/assets.json",
        method="PUT",
        body={"asset": {"key": "layout/theme.liquid", "value": new_src}},
    )

    # Verify-with-retry — Shopify's asset cache has a 2–5 s lag.
    verified = False
    for attempt in range(1, 6):
        await asyncio.sleep(2)
        v = (
            await rest(client, shop, token, f"themes/{theme_id}/assets.json?asset[key]=layout/theme.liquid")
        )["asset"]["value"]
        if MARKER in v and f"'script','dataLayer','{gtm_id}'" in v:
            verified = True
            result["verified_attempt"] = attempt
            break
    result["status"] = "installed" if verified else "cache_lag_retry_later"

    # Clear the now-redundant metafield so the embed block doesn't
    # emit duplicate <script>/<noscript> tags if a merchant enables it.
    try:
        await clear_gtm_metafield(client, shop, token)
        result["metafield_cleared"] = True
    except Exception as e:  # best-effort — never fails the install
        result["metafield_cleared"] = False
        result["metafield_clear_error"] = str(e)[:120]

    return result


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", help="Only install on this one brand slug.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    load_dotenv("/home/support/glitch-grow-ads-agent/.env")
    stores = {s["slug"]: s for s in json.loads(os.environ["STORES_JSON"])}

    targets: list[tuple[str, str, str]] = []
    for slug, gtm_id in GTM_BY_SLUG.items():
        if args.slug and slug != args.slug:
            continue
        if slug not in stores:
            print(f"  ✗ {slug}: no STORES_JSON entry")
            continue
        targets.append((slug, stores[slug]["shop_domain"], gtm_id))

    if not targets:
        print("no targets")
        return 1

    dsn = _read_theme_manager_dsn()
    conn = await asyncpg.connect(dsn)
    try:
        results: list[dict] = []
        async with httpx.AsyncClient() as client:
            for slug, shop, gtm_id in targets:
                token, scope = await get_token(conn, shop)
                r = await install_one(client, slug, shop, gtm_id, token, scope, args.dry_run)
                print(f"  {_tick(r['status']):<2} {slug:<14} {shop:<28} {gtm_id:<15} {r['status']}"
                      + (f" attempt={r['verified_attempt']}" if r.get("verified_attempt") else "")
                      + (f" reason={r.get('reason','')}" if r.get("reason") else ""))
                results.append(r)
        ok = sum(1 for r in results if r["status"] in ("installed", "already_installed", "dry_run"))
        print(f"\n{ok}/{len(results)} ok")
    finally:
        await conn.close()
    return 0


def _tick(status: str) -> str:
    return {"installed": "✓", "already_installed": "•", "dry_run": "·",
            "cache_lag_retry_later": "⚠", "skipped": "✗"}.get(status, "?")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
