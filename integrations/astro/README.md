# Astro integration

Minimal snippets to wire an Astro site into the Glitch Grow AI SEO Agent's fleet API. Copy these two files into your Astro project and you're done.

## 1. Register the site

In the agent's `fleet.json`:

```json
{ "id": "my-site", "name": "My Site", "baseUrl": "https://my-site.example", "platform": "astro" }
```

## 2. Set env on the Astro project

```
# Public — exposed to the build
PUBLIC_GLITCH_SEO_URL=https://grow.glitchexecutor.com

# Private — used only server-side by the <SeoHead> build-time fetch
GLITCH_SEO_TOKEN=<same value as FLEET_API_TOKEN on the agent>
```

## 3. Drop in the `<head>` component

Copy [`SeoHead.astro`](./SeoHead.astro) to `src/components/GlitchSeoHead.astro` and use it in your layout:

```astro
---
import GlitchSeoHead from "../components/GlitchSeoHead.astro";
---
<html>
  <head>
    <GlitchSeoHead siteId="my-site" path={Astro.url.pathname} />
    <!-- your own <title> and <meta> tags come BELOW —
         the agent's outputs are intentionally rendered first so your
         theme defaults can override them when desired. -->
  </head>
  ...
</html>
```

At build time, the component fetches `/api/fleet/:siteId/head?path=...` from the agent and inlines:

- every JSON-LD block the agent has published for this path
- the agent's `<title>` and `<meta name="description">` overrides (page-level wins over site-level)

If the fetch fails, the component emits nothing — your build does not break.

## 4. Expose `/llms.txt`

Copy [`llms.txt.ts`](./llms.txt.ts) to `src/pages/llms.txt.ts` and edit the `SITE_ID` constant. Your site will serve `/llms.txt` from `<your-domain>/llms.txt`, proxying to the agent so the content is editable without a rebuild.

## 5. Trigger rebuilds when the agent publishes

The agent writes artifacts to the database instantly, but Astro's static output only picks them up on the next build. Two options:

- **Manual** — the agent surfaces a "Republish needed" indicator; you click a deploy hook.
- **Automatic** — wire a Vercel / Netlify / Cloudflare Pages deploy hook URL into the agent (coming next session).

## Dev workflow

1. `pnpm audit-fleet my-site` on the agent — confirm reads work
2. In the agent admin UI, Preview + Apply a fix (Organization JSON-LD is the shortest path)
3. Run `astro build && astro preview` on the site
4. Verify the new `<script type="application/ld+json">` is in the rendered head
5. `pnpm audit-fleet my-site` again — the signal should now pass

## Security notes

- `PUBLIC_GLITCH_SEO_URL` is not secret — it's a public URL.
- `GLITCH_SEO_TOKEN` IS secret — set it via your deploy host's env-var UI, not in your repo. The `/api/fleet/:siteId/head` endpoint requires it.
- `/api/fleet/:siteId/llms.txt` is public (AI crawlers don't carry auth).
