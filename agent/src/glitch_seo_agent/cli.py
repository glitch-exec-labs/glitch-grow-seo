"""
CLI entry points. One Typer app with subcommands so systemd / cron can
call a single binary.

  glitch-seo-agent probe             dry-run every API for every site
  glitch-seo-agent probe <site_id>   just one site
  glitch-seo-agent report --all      daily report for every enrolled site
  glitch-seo-agent report <site_id>  one site
  glitch-seo-agent sites             list enrolled sites
"""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Annotated

import structlog
import typer

from .clients.auth import service_account_email
from .db import close_pool
from .logging_setup import configure as configure_logging
from .reports.daily import run as run_daily
from .sources import all_enabled_sites, get_site

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="Python signal-pull pipeline for the Glitch Grow AI SEO Agent.",
)
log = structlog.get_logger("cli")


def _setup(json_output: bool) -> None:
    configure_logging(json_output=json_output)


# --- sites list ------------------------------------------------------

@app.command("sites", help="List enrolled sites across all sources.")
def sites_cmd(
    json_output: Annotated[bool, typer.Option("--json", help="Machine-readable output.")] = False,
) -> None:
    _setup(json_output)

    async def _main() -> list:
        try:
            return await all_enabled_sites()
        finally:
            await close_pool()

    sites = asyncio.run(_main())
    if json_output:
        typer.echo(json.dumps([_site_to_dict(s) for s in sites], indent=2))
        return
    if not sites:
        typer.echo("No enrolled sites.")
        return
    for s in sites:
        typer.echo(f"{s.id:<24} {s.platform:<8} {s.base_url:<40} gsc={s.gsc_property or '—'}")


# --- probe -----------------------------------------------------------

@app.command("probe", help="Dry-run each Google API per site. Reports IAM gaps.")
def probe_cmd(
    site_id: Annotated[str | None, typer.Argument(help="Site id (optional).")] = None,
    json_output: Annotated[bool, typer.Option("--json")] = False,
) -> None:
    _setup(json_output)

    async def _main() -> dict:
        try:
            return await _probe(site_id)
        finally:
            await close_pool()

    result = asyncio.run(_main())
    if json_output:
        typer.echo(json.dumps(result, indent=2))
    else:
        _render_probe_table(result)
    any_fail = any(
        any(status != "ok" for status in s["apis"].values()) for s in result["sites"]
    )
    raise typer.Exit(code=1 if any_fail else 0)


async def _probe(site_id: str | None) -> dict:
    if site_id:
        one = await get_site(site_id)
        if not one:
            return {"error": f"unknown site_id={site_id}", "sites": []}
        targets = [one]
    else:
        targets = await all_enabled_sites()

    sa_email = service_account_email()
    out = {"service_account": sa_email, "sites": []}

    for s in targets:
        apis = {}
        apis["search_console"] = await _probe_gsc(s)
        apis["pagespeed"] = await _probe_psi(s)
        apis["natural_language"] = await _probe_nlp()
        apis["indexing"] = "skipped_v1"
        apis["custom_search"] = "skipped_v1"
        out["sites"].append(
            {
                "id": s.id,
                "platform": s.platform,
                "base_url": s.base_url,
                "gsc_property": s.gsc_property,
                "apis": apis,
            }
        )
    return out


async def _probe_gsc(site) -> str:
    from .clients.search_console import SearchConsoleError, query

    if not site.gsc_property:
        return "no_gsc_property"
    try:
        _ = query(
            site.gsc_property,
            start_date="2024-01-01",
            end_date="2024-01-02",
            dimensions=[],
            row_limit=1,
        )
        return "ok"
    except SearchConsoleError as e:
        # Concise failure category.
        msg = str(e)
        if "403" in msg:
            return "forbidden — add SA to this property"
        if "404" in msg:
            return "not_found — check property URI"
        return f"error: {msg[:120]}"


async def _probe_psi(site) -> str:
    import httpx

    from .clients.pagespeed import audit

    try:
        await audit(site.base_url, strategy="mobile", categories=("performance",))
        return "ok"
    except httpx.HTTPStatusError as e:
        return f"error: HTTP {e.response.status_code}"
    except httpx.HTTPError as e:
        return f"error: {str(e)[:120]}"


async def _probe_nlp() -> str:
    from .clients.natural_language import analyze_entities

    try:
        analyze_entities("Glitch Executor Labs ships AI agents.")
        return "ok"
    except Exception as e:
        return f"error: {str(e)[:120]}"


def _render_probe_table(result: dict) -> None:
    typer.echo(f"SA: {result.get('service_account', '?')}")
    typer.echo("")
    hdr = f"{'site':<24} {'gsc':<28} {'psi':<10} {'nlp':<10}"
    typer.echo(hdr)
    typer.echo("-" * len(hdr))
    for s in result.get("sites", []):
        a = s["apis"]
        typer.echo(
            f"{s['id']:<24} {a['search_console'][:28]:<28} "
            f"{a['pagespeed'][:10]:<10} {a['natural_language'][:10]:<10}"
        )


# --- report ----------------------------------------------------------

@app.command("report", help="Run the daily report for one site, or --all.")
def report_cmd(
    site_id: Annotated[str | None, typer.Argument(help="Site id.")] = None,
    all_sites: Annotated[bool, typer.Option("--all", help="Every enrolled site.")] = False,
    json_output: Annotated[bool, typer.Option("--json")] = False,
) -> None:
    _setup(json_output)
    if not site_id and not all_sites:
        typer.echo("Usage: glitch-seo-agent report <site_id>  OR  glitch-seo-agent report --all", err=True)
        raise typer.Exit(code=2)

    async def _main() -> list[dict]:
        try:
            return await _report(site_id, all_sites)
        finally:
            await close_pool()

    results = asyncio.run(_main())

    if json_output:
        typer.echo(json.dumps(results, indent=2))
    else:
        for r in results:
            s = r.get("summary", {})
            typer.echo(
                f"{r['siteId']:<24} id={r['id']:<40} "
                f"clicks={s.get('clicks')} impressions={s.get('impressions')} "
                f"perf_median={s.get('psi_median_performance')} "
                f"entities={','.join(s.get('top_entities') or [])[:80]}"
            )


async def _report(site_id: str | None, all_sites: bool) -> list[dict]:
    if all_sites:
        targets = await all_enabled_sites()
    else:
        assert site_id
        one = await get_site(site_id)
        if not one:
            typer.echo(f"Unknown site_id={site_id}", err=True)
            sys.exit(2)
        targets = [one]
    out = []
    for s in targets:
        try:
            out.append(await run_daily(s))
        except Exception as e:
            log.error("daily_report.failed", site=s.id, error=str(e))
            out.append({"siteId": s.id, "error": str(e)})
    return out


def _site_to_dict(s) -> dict:
    return {
        "id": s.id,
        "platform": s.platform,
        "base_url": s.base_url,
        "gsc_property": s.gsc_property,
        "psi_targets": s.psi_targets,
        "nlp_targets": s.nlp_targets,
        "enabled": s.enabled,
    }


if __name__ == "__main__":
    app()
