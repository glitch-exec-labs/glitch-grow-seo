/**
 * Platform-agnostic SEO agent — core types & connector contract.
 *
 * The agent is decomposed into four roles:
 *
 *   Auditor  → reads pages via a Connector, extracts deterministic signals
 *   Planner  → LLM synthesizes findings + recommendations from signals + memory
 *   Executor → writes changes back via the same Connector (v0: read-only)
 *   Verifier → re-reads after a write to confirm propagation
 *
 * A Connector is the pluggable adapter that makes the agent work on
 * Shopify, plain HTML, Wix, or anything else. Every connector implements
 * the same capability interface so the core agent stays identical.
 */
export type Platform = "shopify" | "html" | "wix";

/** Minimal shape of a page the connector surfaces to the agent. */
export interface PageSample {
  /** Canonical URL the agent crawls/cites. */
  url: string;
  /** Type hint — agents weight signals differently per role. */
  role: "home" | "product" | "collection" | "article" | "page" | "other";
  /** Raw HTML. MAY be null if the fetch failed — agent must handle gracefully. */
  html: string | null;
  /** Optional platform-native metadata (Shopify product id, Wix page id, etc.). */
  meta?: Record<string, unknown>;
}

/** Edit the executor asks the connector to apply. Read-only in v0. */
export interface PageEdit {
  target: { url?: string; id?: string };
  kind: "meta" | "jsonld" | "copy" | "canonical";
  /** Implementation-specific payload (e.g. a JSON-LD block, a meta tag set). */
  payload: unknown;
  /** Human-readable justification stored in memory + surfaced to the user. */
  rationale: string;
}

/** Result of a verify() call after an edit landed. */
export interface VerifyResult {
  url: string;
  ok: boolean;
  detail: string;
}

/**
 * The capability interface every platform connector implements.
 * Keep this surface tight — it is the contract the agent core depends on.
 */
export interface Connector {
  readonly platform: Platform;
  /** Human-readable handle for logs + memory scoping (e.g. myshop.myshopify.com). */
  readonly siteId: string;

  /** Sample a representative slice of the site for auditing. */
  crawlSample(opts?: { maxPages?: number }): Promise<PageSample[]>;

  /** Apply an edit. v0 connectors may throw NotImplemented — that's fine. */
  applyEdit?(edit: PageEdit): Promise<void>;

  /** Re-fetch a URL and confirm an expected condition. Optional. */
  verify?(url: string, expect: (html: string) => boolean): Promise<VerifyResult>;
}

/** Deterministic signal extracted from one page by the Auditor. */
export interface Signal {
  id: string;
  label: string;
  group: "structured-data" | "on-page" | "content" | "crawl";
  /** true = passing, false = failing, null = not testable (e.g. page not fetched). */
  status: boolean | null;
  /** Where the signal came from — aids the planner's reasoning. */
  source: { url: string; role: PageSample["role"] };
}

/** A planner finding synthesized from signals + memory, usually by an LLM. */
export interface Finding {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  /** Which signals drove this finding — for traceability. */
  evidence: string[];
  /** Suggested next action — executor consumes this in later versions. */
  recommendation?: string;
}

/** One end-to-end run of the agent. Persisted to AgentRun. */
export interface AgentRunResult {
  runId: string;
  siteId: string;
  platform: Platform;
  ranAt: string;
  signals: Signal[];
  findings: Finding[];
  summary: { passing: number; failing: number; unknown: number; total: number };
  plannerModel?: string;
  /** LLM planner was skipped (no API key / disabled). */
  plannerSkipped?: boolean;
}
