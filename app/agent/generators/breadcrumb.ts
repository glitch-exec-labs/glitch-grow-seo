import type { ClientMemory } from "../clientMemory";
import type { EditProposal, PageEdit } from "../types";

export function generateBreadcrumbSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): PageEdit {
  const p = ctx as {
    title?: string;
    url?: string;
    collectionTitle?: string;
    collectionUrl?: string;
    shopUrl?: string;
    shopName?: string;
    handle?: string;
  };

  const homeLabel = cm?.brandName || p.shopName || "Home";

  const items: Record<string, unknown>[] = [];
  let pos = 1;
  if (p.shopUrl) {
    items.push({ "@type": "ListItem", position: pos++, name: homeLabel, item: p.shopUrl });
  }
  if (p.collectionTitle && p.collectionUrl) {
    items.push({ "@type": "ListItem", position: pos++, name: p.collectionTitle, item: p.collectionUrl });
  }
  if (p.title && p.url) {
    items.push({ "@type": "ListItem", position: pos++, name: p.title, item: p.url });
  }

  return {
    kind: "jsonld",
    scope: "product",
    productHandle: proposal.productHandle ?? p.handle,
    schema: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items,
    },
    rationale: proposal.rationale || "BreadcrumbList improves SERP presentation + crawl context.",
  };
}
