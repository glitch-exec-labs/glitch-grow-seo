/**
 * WebSite + SearchAction JSON-LD — deterministic.
 * Enables Google's sitelinks search box.
 */
import type { EditProposal, PageEdit } from "../types";

export function generateWebsiteSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
): PageEdit {
  const shop = ctx as { name?: string; url?: string };
  const base = (shop.url ?? "").replace(/\/+$/, "");

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: shop.name ?? "",
    url: shop.url ?? "",
    potentialAction: {
      "@type": "SearchAction",
      target: `${base}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return {
    kind: "jsonld",
    scope: "shop",
    schema,
    rationale: proposal.rationale || "WebSite + SearchAction enables sitelinks search box.",
  };
}
