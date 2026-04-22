/**
 * Read-side accessor for SeoReport rows (written by the Python
 * signal-pull pipeline). The Node agent consults this so the planner
 * prioritizes fixes on pages that actually have search traffic.
 *
 * Never writes — Python owns SeoReport inserts.
 */
import prisma from "../db.server";

export interface GscPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SiteTraffic {
  reportId: string;
  ranAt: Date;
  period: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  top_queries: GscQueryRow[];
  top_pages: GscPageRow[];
  psi_median_performance: number | null;
  top_entities: string[];
}

/**
 * Latest SeoReport for a site, flattened into the shape the planner
 * consumes. Returns null when there is no report yet or the latest
 * row carries an unresolvable error.
 */
export async function getLatestSiteTraffic(siteId: string): Promise<SiteTraffic | null> {
  try {
    const row = await prisma.seoReport.findFirst({
      where: { siteId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        period: true,
        summary: true,
        gsc: true,
      },
    });
    if (!row) return null;
    const gsc = (row.gsc ?? {}) as Record<string, unknown>;
    const summary = (row.summary ?? {}) as Record<string, unknown>;
    const totals = (gsc.totals ?? {}) as Record<string, unknown>;
    return {
      reportId: row.id,
      ranAt: row.createdAt,
      period: row.period,
      totals: {
        clicks: Number(totals.clicks ?? 0),
        impressions: Number(totals.impressions ?? 0),
        ctr: Number(totals.ctr ?? 0),
        position: Number(totals.position ?? 0),
      },
      top_queries: normalizeList(gsc.top_queries, "query"),
      top_pages: normalizeList(gsc.top_pages, "page"),
      psi_median_performance:
        typeof summary.psi_median_performance === "number"
          ? (summary.psi_median_performance as number)
          : null,
      top_entities: Array.isArray(summary.top_entities)
        ? (summary.top_entities as string[])
        : [],
    };
  } catch {
    return null;
  }
}

/** Render a compact <site_traffic> block for the planner system prompt. */
export function renderSiteTrafficForPrompt(t: SiteTraffic | null): string {
  if (!t) return "";
  const lines: string[] = ["<site_traffic>"];
  lines.push(
    `Last report: ${t.ranAt.toISOString()} · ${t.period} · ` +
      `${t.totals.clicks} clicks / ${t.totals.impressions} impressions / ` +
      `CTR ${(t.totals.ctr * 100).toFixed(2)}% / avg pos ${t.totals.position.toFixed(1)}`,
  );
  if (t.psi_median_performance != null) {
    lines.push(`PSI median performance: ${Math.round(t.psi_median_performance * 100)}/100`);
  }
  if (t.top_pages.length) {
    lines.push("Top pages (ranked by impressions):");
    for (const p of t.top_pages.slice(0, 10)) {
      lines.push(
        `- ${p.page} — ${p.impressions} imp, ${p.clicks} clicks, pos ${p.position.toFixed(1)}`,
      );
    }
  }
  if (t.top_queries.length) {
    lines.push("Top queries:");
    for (const q of t.top_queries.slice(0, 10)) {
      lines.push(
        `- "${q.query}" — ${q.impressions} imp, ${q.clicks} clicks, pos ${q.position.toFixed(1)}`,
      );
    }
  }
  if (t.top_entities.length) {
    lines.push(`Entities: ${t.top_entities.slice(0, 10).join(", ")}`);
  }
  lines.push("</site_traffic>");
  return lines.length > 2 ? lines.join("\n") : "";
}

function normalizeList<T extends "query" | "page">(
  raw: unknown,
  keyField: T,
): (T extends "query" ? GscQueryRow : GscPageRow)[] {
  if (!Array.isArray(raw)) return [] as never;
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      [keyField]: String(r[keyField] ?? ""),
      clicks: Number(r.clicks ?? 0),
      impressions: Number(r.impressions ?? 0),
      ctr: Number(r.ctr ?? 0),
      position: Number(r.position ?? 0),
    })) as never;
}
