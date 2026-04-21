/**
 * Fleet configuration — a static list of sites the agent audits as a
 * group. Used for self-testing against our own Astro marketing sites
 * and any other customer-registered property.
 *
 * Loaded from:
 *   1. $FLEET_SITES_JSON (inline JSON in env) — highest priority
 *   2. $FLEET_CONFIG_PATH file (default: ./fleet.json)
 *   3. empty array (no fleet configured)
 *
 * The fleet is small and known; editing fleet.json and re-running the
 * CLI is the whole interface. A future admin UI can layer on top.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface FleetSite {
  /** Stable short id for the site (also used as siteId in AgentRun). */
  id: string;
  name: string;
  baseUrl: string;
  /** Platform hint for the connector. "astro" is treated as html today. */
  platform: "astro" | "html" | "shopify" | "wix";
  /** Optional GitHub repo — future: writes via PR. */
  repo?: string;
  /** Freeform notes for operators. */
  notes?: string;

  /**
   * Local rebuild config for same-box fleet deployments. If buildDir is
   * set, the agent can spawn `buildCommand` (default `pnpm build`)
   * inside it after an applyEdit, so SSG Astro sites pick up the new
   * PublishedArtifact without a human clicking deploy.
   *
   * Omit buildDir for SSR sites — their <SeoHead> fetches at request
   * time, so no rebuild is needed.
   */
  buildDir?: string;
  buildCommand?: string;
}

export function loadFleet(): FleetSite[] {
  const inline = process.env.FLEET_SITES_JSON;
  if (inline) {
    try {
      const parsed = JSON.parse(inline);
      return normalize(parsed);
    } catch {
      return [];
    }
  }
  const path = process.env.FLEET_CONFIG_PATH || resolve(process.cwd(), "fleet.json");
  try {
    const raw = readFileSync(path, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function findFleetSite(id: string): FleetSite | null {
  return loadFleet().find((s) => s.id === id) ?? null;
}

function normalize(raw: unknown): FleetSite[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => ({
      id: String(x.id ?? ""),
      name: String(x.name ?? x.id ?? ""),
      baseUrl: String(x.baseUrl ?? "").replace(/\/+$/, ""),
      platform: (x.platform as FleetSite["platform"]) ?? "html",
      repo: typeof x.repo === "string" ? x.repo : undefined,
      notes: typeof x.notes === "string" ? x.notes : undefined,
      buildDir: typeof x.buildDir === "string" ? x.buildDir : undefined,
      buildCommand: typeof x.buildCommand === "string" ? x.buildCommand : undefined,
    }))
    .filter((s) => s.id && s.baseUrl);
}
