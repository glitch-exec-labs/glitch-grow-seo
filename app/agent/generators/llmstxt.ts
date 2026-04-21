/**
 * llms.txt generator — LLM-generated site manifest for AI answer engines.
 *
 * llms.txt is the emerging convention (2024-2025) for telling LLMs what
 * a site is and how to cite it. It's markdown, hosted at /llms.txt.
 * This generator produces the content; the Shopify connector hosts it
 * via an app route + registers a 301 redirect so /llms.txt on the
 * storefront resolves to our app.
 */
import OpenAI from "openai";
import type { EditProposal, PageEdit } from "../types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const SYSTEM = `You write llms.txt manifests for online stores. Output markdown only, no fences.
Structure:
  # <Store Name>
  > <one-sentence positioning>

  ## What we sell
  - <category>: <what>
  ...

  ## Key pages
  - [Home](<url>)
  - [All Products](<url>/collections/all)
  - [Shipping & Returns](...)
  ...

  ## Contact
  - Email: <...>
  - Site: <url>

Rules:
- Grounded in shop context. Do not invent URLs, policies, or products.
- ≤ 40 lines. Be concrete, no marketing fluff.
- If a section has nothing honest to say, omit the section.`;

export async function generateLlmsTxt(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
): Promise<PageEdit> {
  const fallbackContent = buildFallback(ctx);
  if (!process.env.OPENAI_API_KEY) {
    return {
      kind: "llmstxt",
      content: fallbackContent,
      rationale: proposal.rationale || "llms.txt published (fallback; no LLM available).",
    };
  }

  try {
    const client = new OpenAI();
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1000,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Shop context:\n${JSON.stringify(ctx, null, 2)}` },
      ],
    });
    const content = (res.choices[0]?.message?.content ?? fallbackContent).trim();
    return {
      kind: "llmstxt",
      content,
      rationale: proposal.rationale || "llms.txt enables AI answer engines to cite this site.",
    };
  } catch {
    return {
      kind: "llmstxt",
      content: fallbackContent,
      rationale: proposal.rationale || "llms.txt published (fallback; LLM error).",
    };
  }
}

function buildFallback(ctx: Record<string, unknown>): string {
  const c = ctx as { name?: string; url?: string; description?: string };
  const lines = [
    `# ${c.name ?? "Store"}`,
    c.description ? `> ${c.description}` : "",
    "",
    "## Key pages",
    c.url ? `- [Home](${c.url})` : "",
    c.url ? `- [All Products](${c.url}/collections/all)` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
