# glitch-seo-agent (Python helper)

Platform-agnostic signal-pull pipeline. Feeds the JS app with deep SEO data that Remix loaders can't cheaply generate in-request.

## Responsibility boundary

| Who does what | Node (Remix) | Python (`agent/`) |
|---|---|---|
| Shopify UI | ✅ | |
| Audit / JSON-LD generation / writes | ✅ | |
| Data plane (Prisma schema owner) | ✅ | |
| Search Console pulls | | ✅ |
| PageSpeed Insights audits | | ✅ |
| Natural Language entity extraction | | ✅ |
| Indexing API submissions (v2) | | ✅ |
| Custom Search / SERP snapshot (v2) | | ✅ |
| Scheduled daily runs | | ✅ |

Python never mutates Shopify. Node never talks to Google.

## Install

```bash
cd agent
uv sync             # or: python -m venv .venv && .venv/bin/pip install -e .[dev]
```

## Credentials

A service-account JSON at `../credentials/google-sa.json` — same file, one copy per project. The SA (`glitch-vertex-ai@capable-boulder-487806-j0.iam.gserviceaccount.com`) needs:

- Search Console: added as *Full* user on every enrolled property
- PageSpeed Insights: API enabled on the GCP project (no per-property config)
- Natural Language: API enabled (no per-property config)
- Indexing API (v2): added as *Owner* on the Search Console property

## Probe first, pull second

```bash
uv run glitch-seo-agent probe        # dry-run every API against every enrolled site
uv run glitch-seo-agent report <id>  # daily report for one site
uv run glitch-seo-agent report --all # all enrolled sites
```

Probe reports which IAM grants are missing per site × per API. Never mutates. Run it first on a new site before anything else.

## Cost

Every API in v1 is free-tier-friendly for a daily run across 4 sites. No LLM calls anywhere. No OpenAI / Anthropic keys needed here.

## Layout

```
agent/
├── pyproject.toml
├── src/glitch_seo_agent/
│   ├── config.py         pydantic-settings loader (paths, env)
│   ├── db.py             asyncpg pool + typed writers for SeoReport
│   ├── sources/          unified SiteRecord registry
│   │   ├── registry.py
│   │   ├── fleet_source.py
│   │   ├── shopify_source.py
│   │   └── site_conn_source.py
│   ├── clients/          httpx-level API wrappers
│   │   ├── auth.py
│   │   ├── search_console.py
│   │   ├── pagespeed.py
│   │   ├── natural_language.py
│   │   ├── indexing.py       (skeleton, v2)
│   │   └── custom_search.py  (skeleton, v2)
│   ├── pulls/            high-level per-API workflows
│   │   ├── gsc.py
│   │   ├── perf.py
│   │   └── entities.py
│   ├── reports/
│   │   └── daily.py
│   └── cli.py
├── scripts/
│   ├── run_daily.sh
│   └── probe_apis.py
└── tests/
```
