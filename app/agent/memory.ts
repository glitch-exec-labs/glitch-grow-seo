/**
 * Agent memory: per-site log of findings + retrieval for the planner.
 *
 * Storage: AgentMemory table (see prisma/schema.prisma). A row is written
 * after every run with the synthesized reply + deterministic signal
 * summary. Retrieval is hybrid — FTS on the reply text + pgvector cosine
 * on the embedding + recency decay — and the top results are stuffed
 * into the planner's prompt as `prior_context`.
 *
 * Fail-open everywhere: memory failures must never break an audit run.
 */
import prisma from "../db.server";
import { embed } from "./embeddings";
import type { Finding, Signal } from "./types";

const LOOKBACK_DAYS = 90;
const HALF_LIFE_DAYS = 30;
const TOP_K = 5;

export type RecallInput = {
  siteId: string;
  query: string;
};

/** Compose a short natural-language blob from signals + findings for embedding. */
function composeMemoryText(signals: Signal[], findings: Finding[]): string {
  const failing = signals.filter((s) => s.status === false).map((s) => s.id);
  const titles = findings.map((f) => `${f.severity}: ${f.title}`);
  return [
    `Failing signals: ${failing.join(", ") || "none"}`,
    ...titles,
  ].join("\n");
}

/** Persist a memory row after an agent run. Never throws. */
export async function logRun(params: {
  siteId: string;
  platform: string;
  signals: Signal[];
  findings: Finding[];
  summary: Record<string, number>;
}) {
  try {
    const text = composeMemoryText(params.signals, params.findings);
    const vector = await embed(text);

    const row = await prisma.agentMemory.create({
      data: {
        siteId: params.siteId,
        platform: params.platform,
        kind: "run_summary",
        summary: text,
        signals: params.signals as unknown as object,
        findings: params.findings as unknown as object,
        metrics: params.summary as unknown as object,
      },
      select: { id: true },
    });

    if (vector) {
      // Prisma doesn't model pgvector natively; use a raw UPDATE.
      await prisma.$executeRawUnsafe(
        `UPDATE "AgentMemory" SET embedding = $1::vector WHERE id = $2`,
        `[${vector.join(",")}]`,
        row.id,
      );
    }
  } catch {
    // fail-open — memory errors never break the agent.
  }
}

/** Hybrid retrieval. Returns a formatted <prior_context> string. */
export async function recall(input: RecallInput): Promise<string> {
  try {
    const vector = await embed(input.query);
    type MemRow = { id: string; createdAt: Date; summary: string; score: number };
    const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - lookbackMs);

    let rows: MemRow[] = [];
    if (vector) {
      rows = (await prisma.$queryRawUnsafe(
        `
        SELECT id, "createdAt", summary,
               (0.6 * (1 - (embedding <=> $1::vector))
              + 0.4 * EXP(-LN(2) * EXTRACT(EPOCH FROM (NOW() - "createdAt")) / ($2 * 86400))
               ) AS score
        FROM "AgentMemory"
        WHERE "siteId" = $3
          AND "createdAt" >= $4
          AND embedding IS NOT NULL
        ORDER BY score DESC
        LIMIT $5
        `,
        `[${vector.join(",")}]`,
        HALF_LIFE_DAYS,
        input.siteId,
        since,
        TOP_K,
      )) as MemRow[];
    } else {
      rows = (await prisma.$queryRawUnsafe(
        `
        SELECT id, "createdAt", summary,
               EXP(-LN(2) * EXTRACT(EPOCH FROM (NOW() - "createdAt")) / ($1 * 86400)) AS score
        FROM "AgentMemory"
        WHERE "siteId" = $2
          AND "createdAt" >= $3
        ORDER BY "createdAt" DESC
        LIMIT $4
        `,
        HALF_LIFE_DAYS,
        input.siteId,
        since,
        TOP_K,
      )) as MemRow[];
    }

    if (!rows.length) return "";

    const bullets = rows
      .map((r) => {
        const ageDays = Math.max(
          1,
          Math.round(
            (Date.now() - new Date(r.createdAt).getTime()) / (86400 * 1000),
          ),
        );
        const firstLine = r.summary.split("\n")[0]?.slice(0, 200) ?? "";
        return `- [${ageDays}d ago] ${firstLine}`;
      })
      .join("\n");

    return `<prior_context>\nPrior related runs from this site's memory (most relevant first).\n${bullets}\n</prior_context>`;
  } catch {
    return "";
  }
}
