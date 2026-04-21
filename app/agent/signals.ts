/**
 * Deterministic SEO signal extraction from raw HTML.
 *
 * These checks run BEFORE the LLM planner — they give the planner
 * ground-truth evidence instead of asking it to inspect HTML directly
 * (which hallucinates and burns tokens). Keep them cheap and regex-only.
 */
import type { PageSample, Signal } from "./types";

type Check = {
  id: string;
  label: string;
  group: Signal["group"];
  appliesTo: PageSample["role"][] | "any";
  test: (html: string) => boolean;
};

const has = (pattern: RegExp) => (html: string) => pattern.test(html);
const missing = (pattern: RegExp) => (html: string) => !pattern.test(html);

const CHECKS: Check[] = [
  // Structured data — homepage
  {
    id: "home.jsonld.present",
    label: "Homepage emits JSON-LD",
    group: "structured-data",
    appliesTo: ["home"],
    test: has(/application\/ld\+json/i),
  },
  {
    id: "home.jsonld.organization",
    label: "Organization / OnlineStore schema on homepage",
    group: "structured-data",
    appliesTo: ["home"],
    test: has(/"@type":\s*"(Organization|OnlineStore)"/),
  },
  {
    id: "home.jsonld.website",
    label: "WebSite + SearchAction schema on homepage",
    group: "structured-data",
    appliesTo: ["home"],
    test: has(/"@type":\s*"(WebSite|SearchAction)"/),
  },
  {
    id: "home.jsonld.faq",
    label: "FAQPage schema on homepage",
    group: "structured-data",
    appliesTo: ["home"],
    test: has(/"@type":\s*"FAQPage"/),
  },

  // Structured data — product pages
  {
    id: "product.jsonld.product",
    label: "Product pages emit Product schema",
    group: "structured-data",
    appliesTo: ["product"],
    test: has(/"@type":\s*"Product"/),
  },
  {
    id: "product.jsonld.breadcrumb",
    label: "Product pages emit BreadcrumbList schema",
    group: "structured-data",
    appliesTo: ["product"],
    test: has(/"@type":\s*"BreadcrumbList"/),
  },
  {
    id: "product.jsonld.additionalProperty",
    label: "Product JSON-LD uses additionalProperty (material, origin, etc.)",
    group: "structured-data",
    appliesTo: ["product"],
    test: has(/"@type":\s*"PropertyValue"/),
  },
  {
    id: "product.jsonld.aggregateRating",
    label: "Product JSON-LD has AggregateRating",
    group: "structured-data",
    appliesTo: ["product"],
    test: has(/"@type":\s*"AggregateRating"/),
  },

  // On-page — applies anywhere
  {
    id: "page.h1.present",
    label: "Page has a semantic H1",
    group: "on-page",
    appliesTo: "any",
    test: has(/<h1[^>]*>/i),
  },
  {
    id: "page.canonical.present",
    label: "Page has canonical tag",
    group: "on-page",
    appliesTo: "any",
    test: has(/rel=["']canonical["']/i),
  },
  {
    id: "page.og.image.https",
    label: "og:image uses https (not http)",
    group: "on-page",
    appliesTo: "any",
    test: missing(/<meta[^>]+property=["']og:image["'][^>]+content=["']http:/i),
  },
  {
    id: "page.title.present",
    label: "Page has a <title>",
    group: "on-page",
    appliesTo: "any",
    test: has(/<title[^>]*>[^<]{3,}<\/title>/i),
  },
  {
    id: "page.meta.description",
    label: "Page has meta description",
    group: "on-page",
    appliesTo: "any",
    test: has(/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i),
  },

  // Content / crawl
  {
    id: "site.llmstxt.linked",
    label: "Homepage references /llms.txt (AI-search content manifest)",
    group: "content",
    appliesTo: ["home"],
    test: has(/\/llms\.txt/i),
  },
];

/** Run all applicable checks for one page sample. */
export function extractSignals(samples: PageSample[]): Signal[] {
  const signals: Signal[] = [];
  for (const sample of samples) {
    for (const check of CHECKS) {
      const applies =
        check.appliesTo === "any" || check.appliesTo.includes(sample.role);
      if (!applies) continue;
      signals.push({
        id: `${sample.role}:${check.id}`,
        label: check.label,
        group: check.group,
        status: sample.html === null ? null : check.test(sample.html),
        source: { url: sample.url, role: sample.role },
      });
    }
  }
  return signals;
}

/** Convenience: summary counts over a list of signals. */
export function summarize(signals: Signal[]) {
  return {
    total: signals.length,
    passing: signals.filter((s) => s.status === true).length,
    failing: signals.filter((s) => s.status === false).length,
    unknown: signals.filter((s) => s.status === null).length,
  };
}
