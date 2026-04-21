/**
 * Organization JSON-LD — deterministic. Merges platform-fetched shop
 * data with ClientMemory-provided brand facts (tagline, sameAs, etc).
 */
import type { ClientMemory } from "../clientMemory";
import type { EditProposal, PageEdit } from "../types";

export function generateOrganizationSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): PageEdit {
  const shop = ctx as {
    name?: string;
    url?: string;
    logoUrl?: string;
    email?: string;
    description?: string;
  };

  const sameAs = new Set<string>();
  if (cm?.sameAs) cm.sameAs.forEach((s) => s && sameAs.add(s));

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: cm?.brandName || shop.name || "",
    url: shop.url ?? "",
  };
  if (shop.logoUrl) schema.logo = shop.logoUrl;
  const description = cm?.tagline || shop.description;
  if (description) schema.description = description;
  if (shop.email) schema.email = shop.email;
  if (sameAs.size > 0) schema.sameAs = [...sameAs];

  return {
    kind: "jsonld",
    scope: "shop",
    schema,
    rationale: proposal.rationale || "Organization schema for brand recognition + AI citability.",
  };
}
