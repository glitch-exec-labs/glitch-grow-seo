/**
 * Agent run orchestrator. One call runs a full turn:
 *
 *   1. connector.crawlSample()           → page samples
 *   2. extractSignals(samples)           → deterministic signals
 *   3. memory.recall(siteId, query)      → prior_context blob
 *   4. llm.plan(signals, priorContext)   → LLM-synthesized findings
 *   5. memory.logRun(...)                → persist for next run
 *   6. return AgentRunResult
 *
 * Every stage is fail-open: the agent must always return a usable
 * result, even if the LLM is disabled or memory is unavailable.
 */
import prisma from "../db.server";
import { plan } from "./llm";
import { logRun, recall } from "./memory";
import { extractSignals, summarize } from "./signals";
import type { AgentRunResult, Connector } from "./types";

export async function runAudit(connector: Connector): Promise<AgentRunResult> {
  const ranAt = new Date();
  const samples = await connector.crawlSample({ maxPages: 4 });
  const signals = extractSignals(samples);
  const summary = summarize(signals);

  const query = signals
    .filter((s) => s.status === false)
    .map((s) => s.id)
    .join(" ");
  const priorContext = await recall({
    siteId: connector.siteId,
    query: query || "seo audit",
  });

  const planned = await plan({
    siteId: connector.siteId,
    platform: connector.platform,
    signals,
    priorContext,
  });

  // Persist AgentRun row for history / UI.
  let runId = "";
  try {
    const row = await prisma.agentRun.create({
      data: {
        siteId: connector.siteId,
        platform: connector.platform,
        summary: summary as unknown as object,
        signals: signals as unknown as object,
        findings: planned.findings as unknown as object,
        plannerModel: planned.model ?? null,
        plannerSkipped: planned.skipped,
        error: planned.error ?? null,
      },
      select: { id: true },
    });
    runId = row.id;
  } catch {
    runId = `mem-${ranAt.getTime()}`;
  }

  // Fire-and-forget memory log.
  void logRun({
    siteId: connector.siteId,
    platform: connector.platform,
    signals,
    findings: planned.findings,
    summary,
  });

  return {
    runId,
    siteId: connector.siteId,
    platform: connector.platform,
    ranAt: ranAt.toISOString(),
    signals,
    findings: planned.findings,
    summary,
    plannerModel: planned.model,
    plannerSkipped: planned.skipped,
  };
}
