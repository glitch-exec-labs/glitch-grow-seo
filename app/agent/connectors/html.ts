/**
 * HTML connector — reads + writes for Astro / plain-HTML sites.
 *
 * Reads: sitemap.xml walk + per-page fetch. Detects Astro fingerprints.
 *
 * Writes: applyEdit() does NOT commit to git or SFTP — instead the
 * concrete PageEdit persists to the PublishedArtifact table. Astro
 * sites fetch those artifacts at build time via
 *   /api/fleet/:siteId/head?path=...
 * and serve /llms.txt via
 *   /api/fleet/:siteId/llms.txt
 * (see integrations/astro/ for the copy-paste snippets).
 *
 * This moves the write surface away from per-site deploy plumbing
 * (git PRs, Asset API) and into a shared database. Each Astro site
 * picks up the latest artifacts on its next build — trigger a deploy
 * webhook from your CI when the agent publishes.
 */
import prisma from "../../db.server";
import { autoRebuildEnabled, scheduleRebuild } from "../rebuild";
import type { Connector, PageEdit, PageSample, VerifyResult } from "../types";

const USER_AGENT = "GlitchSEO-Agent/0.3";
const FETCH_TIMEOUT_MS = 8_000;

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Parse sitemap.xml (or sitemap index) and return up to `max` URLs. */
async function discoverUrlsFromSitemap(base: string, max: number): Promise<string[]> {
  const root = base.replace(/\/+$/, "");
  const candidates = [`${root}/sitemap.xml`, `${root}/sitemap_index.xml`];
  for (const sm of candidates) {
    const xml = await getText(sm);
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1]);
    if (locs.length === 0) continue;

    // If it's a sitemap index, fetch the first child.
    if (/<sitemapindex/i.test(xml) && locs[0]) {
      const child = await getText(locs[0]);
      if (child) {
        const childLocs = [...child.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1]);
        return childLocs.slice(0, max);
      }
    }
    return locs.slice(0, max);
  }
  return [];
}

function guessRole(url: string, base: string): PageSample["role"] {
  const path = url.replace(base, "").toLowerCase();
  if (path === "" || path === "/" || path === "/index.html") return "home";
  if (/\/products?\//.test(path)) return "product";
  if (/\/collections?\//.test(path) || /\/category\//.test(path)) return "collection";
  if (/\/blog\//.test(path) || /\/articles?\//.test(path)) return "article";
  return "page";
}

/** Detect common Astro fingerprints so the planner's prior memory can
 *  key on platform quirks (view transitions, island hydration, etc.). */
function detectAstro(html: string | null): boolean {
  if (!html) return false;
  return (
    /<astro-island\b/i.test(html) ||
    /data-astro-cid-/i.test(html) ||
    /\/_astro\/[a-z0-9.-]+\.(?:js|css)/i.test(html) ||
    /<meta\s+name=["']generator["'][^>]+content=["']Astro/i.test(html)
  );
}

export function htmlConnector(baseUrl: string): Connector {
  const normalized = baseUrl.replace(/\/+$/, "");
  return {
    platform: "html",
    siteId: normalized,

    async crawlSample(opts): Promise<PageSample[]> {
      const maxPages = opts?.maxPages ?? 4;
      const discovered = await discoverUrlsFromSitemap(normalized, maxPages * 4);

      // Always start with the base URL.
      const urls: string[] = [normalized];
      // Pick diverse roles from discovered list.
      const picked = new Set<string>([normalized]);
      const wantRoles = new Set<PageSample["role"]>(["product", "collection", "article"]);
      for (const u of discovered) {
        if (picked.size >= maxPages) break;
        if (picked.has(u)) continue;
        const role = guessRole(u, normalized);
        if (role === "home") continue;
        if (!wantRoles.has(role) && picked.size < maxPages - 1) continue;
        picked.add(u);
        urls.push(u);
      }

      return Promise.all(
        urls.slice(0, maxPages).map(async (url) => {
          const html = await getText(url);
          return {
            url,
            role: guessRole(url, normalized),
            html,
            meta: { astro: detectAstro(html) },
          };
        }),
      );
    },

    async fetchContext(_scope, _handle): Promise<Record<string, unknown>> {
      // Minimal context: just what we can observe from the homepage
      // without auth. Writer-side context will expand when applyEdit lands.
      const html = await getText(normalized);
      const titleMatch = html?.match(/<title[^>]*>([^<]*)<\/title>/i);
      const descMatch = html?.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i,
      );
      return {
        url: normalized,
        name: titleMatch?.[1]?.trim() ?? normalized,
        description: descMatch?.[1]?.trim() ?? "",
      };
    },

    async applyEdit(edit: PageEdit): Promise<void> {
      const { scope, pageKey, kind, key, content, rationale } = serializeEdit(edit);
      await prisma.publishedArtifact.upsert({
        where: {
          siteId_scope_pageKey_kind_key: {
            siteId: normalized,
            scope,
            pageKey,
            kind,
            key,
          },
        },
        create: { siteId: normalized, scope, pageKey, kind, key, content, rationale },
        update: { content, rationale },
      });

      // Trigger a same-box rebuild if the fleet site has buildDir set
      // and FLEET_AUTO_REBUILD=true. Debounced — bursts of edits
      // coalesce into one rebuild.
      if (autoRebuildEnabled()) {
        scheduleRebuild(normalized);
      }
    },

    async verify(url, expect): Promise<VerifyResult> {
      const html = await getText(url);
      if (html === null) return { url, ok: false, detail: "Fetch failed." };
      const ok = expect(html);
      return {
        url,
        ok,
        detail: ok
          ? "Verified: expected signal present."
          : "Artifact published. Signal will appear after the next Astro build picks it up via the fleet API.",
      };
    },
  };
}

/**
 * Serialize a PageEdit into a stable PublishedArtifact row shape.
 * pageKey uses the special value "__shop" for scope=shop so the unique
 * index is well-defined without nullable columns.
 */
function serializeEdit(edit: PageEdit): {
  scope: string;
  pageKey: string;
  kind: string;
  key: string;
  content: object;
  rationale: string;
} {
  if (edit.kind === "jsonld") {
    const atType = (edit.schema["@type"] as string) || "Unknown";
    return {
      scope: edit.scope,
      pageKey: edit.scope === "shop" ? "__shop" : (edit.productHandle || "__shop"),
      kind: "jsonld",
      key: atType,
      content: edit.schema,
      rationale: edit.rationale,
    };
  }
  if (edit.kind === "meta") {
    return {
      scope: edit.scope,
      pageKey: edit.scope === "shop" ? "__shop" : (edit.productHandle || "__shop"),
      kind: "meta",
      key: "head",
      content: { title: edit.title ?? null, description: edit.description ?? null },
      rationale: edit.rationale,
    };
  }
  if (edit.kind === "llmstxt") {
    return {
      scope: "shop",
      pageKey: "__shop",
      kind: "llmstxt",
      key: "llmstxt",
      content: { content: edit.content },
      rationale: edit.rationale,
    };
  }
  // copy
  return {
    scope: "product",
    pageKey: edit.productHandle,
    kind: "copy",
    key: "description",
    content: { descriptionHtml: edit.descriptionHtml },
    rationale: edit.rationale,
  };
}
