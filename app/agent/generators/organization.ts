/**
 * Organization JSON-LD generator — deterministic, no LLM.
 *
 * Builds a schema.org/Organization block from shop context. Merchants
 * usually want Organization schema so Google can show the brand in the
 * knowledge panel and AI assistants can cite the store.
 */
import type { EditProposal, PageEdit } from "../types";

export function generateOrganizationSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
): PageEdit {
  const shop = ctx as {
    name?: string;
    url?: string;
    logoUrl?: string;
    email?: string;
    description?: string;
    sameAs?: string[];
  };

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: shop.name ?? "",
    url: shop.url ?? "",
  };
  if (shop.logoUrl) schema.logo = shop.logoUrl;
  if (shop.description) schema.description = shop.description;
  if (shop.email) schema.email = shop.email;
  if (Array.isArray(shop.sameAs) && shop.sameAs.length > 0) schema.sameAs = shop.sameAs;

  return {
    kind: "jsonld",
    scope: "shop",
    schema,
    rationale: proposal.rationale || "Organization schema for brand recognition + AI citability.",
  };
}
