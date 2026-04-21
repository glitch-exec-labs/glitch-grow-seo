/**
 * LLM planner — turns deterministic signals + memory into a ranked list of
 * findings with recommendations. Fail-open: if ANTHROPIC_API_KEY is unset
 * or the call errors, we skip the planner and return the raw signals as
 * info-level findings.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Finding, Signal } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are the planner node of an autonomous SEO agent that works on Shopify, plain HTML, and Wix websites.

Your job: given (a) a list of deterministic SEO signals extracted from the site and (b) prior context from this site's memory, produce a short, ranked list of actionable findings.

Rules:
- Output strict JSON. No prose, no markdown, no code fences.
- Shape: {"findings":[{"id","severity","title","body","evidence":[...],"recommendation"}]}
- severity ∈ {"critical","warning","info"}.
- id is kebab-case, stable across runs for the same underlying issue.
- evidence[] references signal ids verbatim.
- body explains impact in plain English (2–3 sentences max).
- recommendation is one concrete next action the agent could execute.
- Prefer critical findings that unlock rich results (Product, FAQPage, Breadcrumb) or AI-answer citations.
- If prior memory shows a finding was already resolved, do not resurface it unless signals regressed.
- Cap total findings at 8. Merge duplicates.`;

export type PlannerInput = {
  siteId: string;
  platform: string;
  signals: Signal[];
  priorContext?: string;
};

export type PlannerOutput = {
  findings: Finding[];
  model?: string;
  skipped: boolean;
  error?: string;
};

export async function plan(input: PlannerInput): Promise<PlannerOutput> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { findings: fallbackFindings(input.signals), skipped: true };
  }
  const client = new Anthropic();

  const userPayload = {
    siteId: input.siteId,
    platform: input.platform,
    signals: input.signals.map((s) => ({
      id: s.id,
      label: s.label,
      group: s.group,
      status: s.status,
      url: s.source.url,
    })),
    prior_context: input.priorContext || "",
  };

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Site signals and prior memory below. Return findings JSON.\n\n${JSON.stringify(
            userPayload,
            null,
            2
          )}`,
        },
      ],
    });
    const text =
      res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("") || "";

    const parsed = safeParseFindings(text);
    return { findings: parsed, model: MODEL, skipped: false };
  } catch (err) {
    return {
      findings: fallbackFindings(input.signals),
      skipped: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function safeParseFindings(raw: string): Finding[] {
  // Tolerate accidental fences or leading prose.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]);
    const arr = Array.isArray(obj.findings) ? obj.findings : [];
    return arr
      .filter((f: unknown) => typeof f === "object" && f !== null)
      .map((f: Record<string, unknown>, i: number) => ({
        id: String(f.id ?? `finding-${i}`),
        severity:
          (f.severity as Finding["severity"]) ?? ("info" as const),
        title: String(f.title ?? "Untitled finding"),
        body: String(f.body ?? ""),
        evidence: Array.isArray(f.evidence)
          ? (f.evidence as unknown[]).map(String)
          : [],
        recommendation:
          typeof f.recommendation === "string" ? f.recommendation : undefined,
      }));
  } catch {
    return [];
  }
}

/** Deterministic findings used when the LLM planner is unavailable. */
function fallbackFindings(signals: Signal[]): Finding[] {
  const failing = signals.filter((s) => s.status === false);
  return failing.slice(0, 8).map((s) => ({
    id: s.id,
    severity: s.group === "structured-data" ? "warning" : "info",
    title: `Missing: ${s.label}`,
    body: `Signal ${s.id} is failing on ${s.source.url}.`,
    evidence: [s.id],
  }));
}
