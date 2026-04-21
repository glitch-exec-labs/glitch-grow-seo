/**
 * Product JSON-LD — deterministic from product context.
 *
 * Emits a schema.org/Product block with offers, aggregateRating (when
 * present), and additionalProperty entries derived from product tags
 * and metafields. Google requires this for Product rich results.
 */
import type { EditProposal, PageEdit } from "../types";

export function generateProductSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
): PageEdit {
  const p = ctx as {
    title?: string;
    handle?: string;
    description?: string;
    url?: string;
    imageUrls?: string[];
    vendor?: string;
    price?: string;
    currency?: string;
    availability?: string; // "InStock" | "OutOfStock"
    sku?: string;
    gtin?: string;
    tags?: string[];
    ratingValue?: number;
    reviewCount?: number;
  };

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title ?? "",
    description: stripHtml(p.description ?? "").slice(0, 5000),
    ...(p.imageUrls?.length ? { image: p.imageUrls } : {}),
    ...(p.url ? { url: p.url } : {}),
    ...(p.vendor ? { brand: { "@type": "Brand", name: p.vendor } } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.gtin ? { gtin: p.gtin } : {}),
  };

  if (p.price && p.currency) {
    schema.offers = {
      "@type": "Offer",
      priceCurrency: p.currency,
      price: p.price,
      availability: `https://schema.org/${p.availability || "InStock"}`,
      url: p.url,
    };
  }

  if (typeof p.ratingValue === "number" && typeof p.reviewCount === "number" && p.reviewCount > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: p.ratingValue,
      reviewCount: p.reviewCount,
    };
  }

  const additionalProperty = extractAdditionalProperty(p.tags ?? []);
  if (additionalProperty.length) schema.additionalProperty = additionalProperty;

  return {
    kind: "jsonld",
    scope: "product",
    productHandle: proposal.productHandle ?? p.handle,
    schema,
    rationale: proposal.rationale || "Product schema enables Google Product rich results + AI shopping answers.",
  };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Mine product tags for `key:value` pairs we can surface as structured
 *  attributes. Common merchant convention in Shopify. */
function extractAdditionalProperty(tags: string[]): unknown[] {
  const out: unknown[] = [];
  for (const tag of tags) {
    const [k, ...rest] = tag.split(":");
    if (!k || rest.length === 0) continue;
    out.push({
      "@type": "PropertyValue",
      name: k.trim(),
      value: rest.join(":").trim(),
    });
  }
  return out;
}
