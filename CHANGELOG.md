# Changelog — `glitch-grow-public`

Auto-regenerated from `git log` by `/home/support/bin/changelog-regen`,
called before every push by `/home/support/bin/git-sync-all` (cron `*/15 * * * *`).

**Purpose:** traceability. If a push broke something, scan dates + short SHAs
here; then `git show <sha>` to see the diff, `git revert <sha>` to undo.

**Format:** UTC dates, newest first. Each entry: `time — subject (sha) — N files`.
Body text (if present) shown as indented sub-bullets.

---

## 2026-04-21

- **04:15 UTC** — auto-sync: 2026-04-21 04:15 UTC (`656aa61`) — 11 files
        A	app/agent/clientMemory.ts
        M	app/agent/generators/breadcrumb.ts
        M	app/agent/generators/copy.ts
        M	app/agent/generators/faq.ts
        M	app/agent/generators/index.ts
        ... (+6 more)
- **04:07 UTC** — feat(agent): executor — preview-first writes, theme extension, llms.txt (`b674598`) — 24 files
    Second-pass agent now plans, generates, previews, applies, and verifies
    concrete edits. Planner moved from Anthropic → OpenAI gpt-4o for both
    the planner and memory embeddings (single OPENAI_API_KEY).
    Generators (app/agent/generators/):
    - organization, website, product, breadcrumb   (deterministic JSON-LD)
    - faq, meta, llmstxt, copy                     (LLM-generated content)
    Connector writes (app/agent/connectors/shopify.ts):
    - applyEdit dispatches on PageEdit kind
      jsonld  → metafieldsSet under glitch_grow_seo namespace
      meta    → metafieldsSet (title + description)
- **03:44 UTC** — feat(agent): v0 platform-agnostic SEO agent (`153342e`) — 18 files
    Core agent + Shopify connector + HTML/Wix stubs. One auditor, planner,
    memory, and runner; pluggable connectors implement the same capability
    interface so the same agent runs across any platform.
    - app/agent/types.ts: Connector interface + Signal / Finding / RunResult
    - app/agent/signals.ts: deterministic regex signal extraction
    - app/agent/llm.ts: Anthropic planner (fail-open if no API key)
    - app/agent/embeddings.ts: OpenAI embedding shim
    - app/agent/memory.ts: pgvector + recency-decay hybrid retrieval
    - app/agent/runner.ts: crawl → signals → recall → plan → persist
    - app/agent/connectors/{shopify.ts, html.ts, wix.ts}
- **03:24 UTC** — docs: rename to Glitch Grow AI SEO Agent (`a11613f`) — 1 file
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- **03:23 UTC** — docs: rename to AI SEO Agent (`3b57e17`) — 1 file
    Rebrand README heading/tagline and update repo slug links.
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- **03:19 UTC** — docs: update repo slug in README to glitch-grow-ai-seo (`f64172e`) — 1 file
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

## 2026-04-20

- **22:54 UTC** — Update docs after public repo renames (`115c1e2`) — 1 file
- **20:49 UTC** — Polish branding for Glitch Executor Labs public positioning (`7479a2c`) — 1 file

## 2026-04-19

- **21:36 UTC** — docs: polish README for public repo (`aada919`) — 1 file
    Add tagline, badges, feature list, stack table, scripts table, project
    layout, GDPR section, support + license footer.
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- **21:36 UTC** — docs: clean CHANGELOG preamble for public repo (`c23fd0f`) — 1 file
    Strip references to internal generator paths and cron schedule.
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- **20:35 UTC** — chore: prepare repo for public release (`c391fc7`) — 4 files
    - remove cli/shops.json (customer shop domains) from tree + gitignore
    - drop hardcoded customer alias fallback in cli/sh-admin.mjs
    - add MIT LICENSE
    - rewrite README for Glitch Grow (was untouched Shopify template)
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

## 2026-04-15

- **02:21 UTC** — auto-sync: 2026-04-15 02:21 UTC (`5344584`) — 2 files
        M	.mcp.json
- **00:57 UTC** — fix: remove plan badge from dashboard (Shopify rejects pricing info in screenshots) (`0478893`) — 2 files
- **00:16 UTC** — auto-sync: 2026-04-15 00:16 UTC (`3434abf`) — 2 files
        M	shopify.app.toml
- **00:10 UTC** — feat: add GDPR compliance webhook handlers (`8ae60e1`) — 5 files
    - customers/data_request: no customer data held, acknowledge
    - customers/redact: no customer data held, acknowledge
    - shop/redact: delete any remaining session for the shop (defensive)
    - Webhook topics removed from shopify.app.toml (Shopify manages GDPR webhooks
      via Partner Dashboard UI only, not via CLI config)

## 2026-04-14

- **23:58 UTC** — feat: add /privacy, /support, /docs public pages + fix landing page copy (`be932b5`) — 5 files
    - Replace scaffold '/' copy ('A short heading about [your app]') with
      real Glitch SEO positioning + install form + resource links
    - /privacy: full Shopify-review-ready privacy policy (data accessed,
      stored, NOT stored; retention; subprocessors; GDPR-style rights)
    - /support: email + common issues + feedback path
    - /docs: getting started, audit explainer, scope table, FAQ
    - All pages self-contained, no external dependencies, inline styled
      for review-friendliness
- **23:22 UTC** — docs: refresh CHANGELOG.md (`29647bf`) — 1 file
- **23:22 UTC** — docs: add auto-generated CHANGELOG.md (`8504c2b`) — 1 file
- **23:12 UTC** — chore: initial commit — Glitch SEO public app (`ec08f26`) — 44 files
    - Shopify App Store candidate (client_id 44bf7f37..., public distribution)
    - Serves grow.glitchexecutor.com on port 3102
    - Prisma + Postgres shared with glitch-grow agency app
    - Embedded-admin dashboard with live SEO audit runner
