/**
 * Product JSON-LD — deterministic.
 *
 * ClientMemory contributes brand name override and key-term emphasis
 * (when brandName is set, it trumps the Shopify vendor field for the
 * `brand` property — common when vendor is internal).
 */
import type { ClientMemory } from "../clientMemory";
import type { EditProposal, PageEdit } from "../types";

export function generateProductSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
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
    availability?: string;
    sku?: string;
    gtin?: string;
    tags?: string[];
    ratingValue?: number;
    reviewCount?: number;
  };

  const brandName = cm?.brandName || p.vendor;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title ?? "",
    description: stripHtml(p.description ?? "").slice(0, 5000),
    ...(p.imageUrls?.length ? { image: p.imageUrls } : {}),
    ...(p.url ? { url: p.url } : {}),
    ...(brandName ? { brand: { "@type": "Brand", name: brandName } } : {}),
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
