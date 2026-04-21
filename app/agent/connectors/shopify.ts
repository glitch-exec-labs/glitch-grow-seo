/**
 * Shopify connector — the first fully-implemented platform adapter.
 *
 * Uses the embedded-app Admin GraphQL client to discover the storefront
 * URL + a representative product + collection, then fetches the rendered
 * HTML directly from the public storefront for signal extraction.
 *
 * applyEdit / verify stubs throw NotImplemented in v0. They will land
 * when the executor ships (next session).
 */
import type {
  Connector,
  PageEdit,
  PageSample,
  VerifyResult,
} from "../types";

type AdminGraphQL = {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

const USER_AGENT = "GlitchSEO-Agent/0.1";

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // 8s per-page budget — storefronts can be slow.
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function shopifyConnector(admin: AdminGraphQL, shopDomain: string): Connector {
  return {
    platform: "shopify",
    siteId: shopDomain,

    async crawlSample(opts) {
      const maxPages = opts?.maxPages ?? 4;
      const ctxRes = await admin.graphql(`#graphql
        {
          shop {
            primaryDomain { url }
            myshopifyDomain
          }
          products(first: 1) { edges { node { onlineStoreUrl handle } } }
          collections(first: 1) { edges { node { onlineStoreUrl handle } } }
          articles(first: 1) { edges { node { onlineStoreUrl } } }
        }
      `);
      const ctx = (await ctxRes.json()).data;
      const base =
        ctx.shop.primaryDomain?.url || `https://${ctx.shop.myshopifyDomain}`;
      const productUrl = ctx.products.edges[0]?.node?.onlineStoreUrl ?? null;
      const collectionUrl = ctx.collections.edges[0]?.node?.onlineStoreUrl ?? null;
      const articleUrl = ctx.articles?.edges?.[0]?.node?.onlineStoreUrl ?? null;

      const targets: Array<{ url: string | null; role: PageSample["role"] }> = [
        { url: base, role: "home" },
        { url: productUrl, role: "product" },
        { url: collectionUrl, role: "collection" },
        { url: articleUrl, role: "article" },
      ];

      const picked = targets
        .filter((t): t is { url: string; role: PageSample["role"] } => !!t.url)
        .slice(0, maxPages);

      const samples = await Promise.all(
        picked.map(async ({ url, role }) => ({
          url,
          role,
          html: await fetchHtml(url),
        })),
      );
      return samples;
    },

    async applyEdit(_edit: PageEdit): Promise<void> {
      throw new Error("shopifyConnector.applyEdit: not implemented in v0");
    },

    async verify(_url, _expect): Promise<VerifyResult> {
      throw new Error("shopifyConnector.verify: not implemented in v0");
    },
  };
}
