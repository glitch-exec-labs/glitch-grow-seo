/**
 * Agent orchestration. Three entry points:
 *
 *   runAudit(connector)                   — the full read-only audit loop
 *   previewEdit(connector, proposal, sid) — hydrate proposal into a PageEdit
 *                                           (preview only, no write)
 *   applyEdit(connector, edit, signalId)  — write + verify (throws on failure)
 *
 * Every stage is fail-open on reads and strict on writes: a merchant
 * clicking Apply should get a clear error if the write failed.
 */
import prisma from "../db.server";
import { plan } from "./llm";
import { logRun, recall } from "./memory";
import { extractSignals, summarize } from "./signals";
import { generateEdit } from "./generators";
import type {
  AgentRunResult,
  Connector,
  EditProposal,
  PageEdit,
  VerifyResult,
} from "./types";

export async function runAudit(connector: Connector): Promise<AgentRunResult> {
  const ranAt = new Date();
  const samples = await connector.crawlSample({ maxPages: 4 });
  const signals = extractSignals(samples);
  const summary = summarize(signals);

  const query = signals.filter((s) => s.status === false).map((s) => s.id).join(" ");
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

export async function previewEdit(
  connector: Connector,
  proposal: EditProposal,
  signalId?: string,
): Promise<PageEdit> {
  return generateEdit(connector, proposal, { signalId });
}

export async function applyEdit(
  connector: Connector,
  edit: PageEdit,
  signalId?: string,
): Promise<{ applied: true; verify: VerifyResult | null }> {
  await connector.applyEdit(edit);
  const verify = await tryVerify(connector, edit, signalId);
  return { applied: true, verify };
}

async function tryVerify(
  connector: Connector,
  edit: PageEdit,
  signalId?: string,
): Promise<VerifyResult | null> {
  // Map edit kind to a lightweight HTML expectation so verify() is
  // meaningful without re-running the full audit.
  const expect = buildExpectation(edit, signalId);
  const url = await bestVerifyUrl(connector, edit);
  if (!url || !expect) return null;
  try {
    return await connector.verify(url, expect);
  } catch {
    return null;
  }
}

function buildExpectation(
  edit: PageEdit,
  signalId?: string,
): ((html: string) => boolean) | null {
  if (edit.kind === "jsonld") {
    const t = (edit.schema["@type"] as string) ?? "";
    if (!t) return null;
    const needle = new RegExp(`"@type"\\s*:\\s*"${escapeRegex(t)}"`);
    return (html) => needle.test(html);
  }
  if (edit.kind === "meta") {
    if (edit.description) {
      return (html) => html.includes(edit.description!.slice(0, 40));
    }
    return null;
  }
  if (edit.kind === "llmstxt") {
    // verified via direct llms.txt fetch in the UI, not here
    return null;
  }
  if (edit.kind === "copy") {
    const snippet = edit.descriptionHtml.replace(/<[^>]+>/g, " ").slice(0, 60);
    return (html) => html.includes(snippet);
  }
  // Exhaustive fallback — unused.
  void signalId;
  return null;
}

async function bestVerifyUrl(
  connector: Connector,
  edit: PageEdit,
): Promise<string | null> {
  if (edit.kind === "copy" || (edit.kind === "jsonld" && edit.scope === "product") ||
      (edit.kind === "meta" && edit.scope === "product")) {
    if (!edit.productHandle) return null;
    const ctx = await connector.fetchContext("product", edit.productHandle);
    return typeof ctx.url === "string" ? (ctx.url as string) : null;
  }
  const ctx = await connector.fetchContext("shop");
  return typeof ctx.url === "string" ? (ctx.url as string) : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
