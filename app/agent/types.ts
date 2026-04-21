/**
 * Platform-agnostic SEO agent — core types & connector contract.
 *
 *   Auditor  → reads pages via a Connector, extracts deterministic signals
 *   Planner  → LLM synthesizes ranked findings with executable edit proposals
 *   Executor → connector.applyEdit writes the edit back to the platform
 *   Verifier → connector.verify re-crawls to confirm the edit propagated
 */
export type Platform = "shopify" | "html" | "wix";

export interface PageSample {
  url: string;
  role: "home" | "product" | "collection" | "article" | "page" | "other";
  html: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Discriminated union of concrete edits the executor can apply.
 * Each connector dispatches on `kind` and maps to its native write API
 * (Shopify: metafields + productUpdate + UrlRedirect; Wix: Velo data;
 * HTML: file diff / PR).
 */
export type PageEdit =
  | {
      kind: "jsonld";
      scope: "shop" | "product";
      productHandle?: string;
      /** Full JSON-LD object ready to serialize. */
      schema: Record<string, unknown>;
      rationale: string;
    }
  | {
      kind: "meta";
      scope: "shop" | "product";
      productHandle?: string;
      title?: string;
      description?: string;
      rationale: string;
    }
  | {
      kind: "llmstxt";
      content: string;
      rationale: string;
    }
  | {
      kind: "copy";
      productHandle: string;
      descriptionHtml: string;
      rationale: string;
    };

/** What the planner emits per-finding — a commitment the generator can
 * later hydrate into a full PageEdit. Scoped narrower than PageEdit so
 * the LLM doesn't have to fabricate schema bodies. */
export interface EditProposal {
  kind: PageEdit["kind"];
  scope: "shop" | "product" | "site";
  productHandle?: string;
  rationale: string;
}

export interface VerifyResult {
  url: string;
  ok: boolean;
  detail: string;
}

export interface Connector {
  readonly platform: Platform;
  readonly siteId: string;

  crawlSample(opts?: { maxPages?: number }): Promise<PageSample[]>;

  /** Apply a concrete edit. Throws NotImplemented on stub connectors. */
  applyEdit(edit: PageEdit): Promise<void>;

  /** Re-fetch a URL and run an HTML-level check; returns ok + detail. */
  verify(url: string, expect: (html: string) => boolean): Promise<VerifyResult>;

  /**
   * Platform-specific context the generators need to hydrate an
   * EditProposal into a concrete PageEdit (shop name, logo, product
   * details, primary domain, etc.). Connectors implement this so the
   * generator layer stays platform-agnostic.
   */
  fetchContext(
    scope: "shop" | "product" | "site",
    productHandle?: string,
  ): Promise<Record<string, unknown>>;
}

export interface Signal {
  id: string;
  label: string;
  group: "structured-data" | "on-page" | "content" | "crawl";
  status: boolean | null;
  source: { url: string; role: PageSample["role"] };
}

export interface Finding {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  evidence: string[];
  recommendation?: string;
  /** Planner-proposed edit. Null if this finding needs merchant judgement. */
  edit: EditProposal | null;
}

export interface AgentRunResult {
  runId: string;
  siteId: string;
  platform: Platform;
  ranAt: string;
  signals: Signal[];
  findings: Finding[];
  summary: { passing: number; failing: number; unknown: number; total: number };
  plannerModel?: string;
  plannerSkipped?: boolean;
}
