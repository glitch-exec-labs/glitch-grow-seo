/**
 * Product description rewrite — LLM-generated.
 *
 * Rewrites product copy into a format that traditional search AND AI
 * answer engines can cite: factual bullets, concrete attributes, clear
 * category + use-case, minimal marketing fluff.
 *
 * Preview-first — nothing is written to productUpdate until the
 * merchant confirms in the admin UI.
 */
import OpenAI from "openai";
import type { EditProposal, PageEdit } from "../types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const SYSTEM = `You rewrite Shopify product descriptions to be citable by AI answer engines (ChatGPT, Perplexity, Google AI Overviews) while staying on-brand.

Output: HTML fragment (no <html> / <body>). Use <p>, <ul>, <li>, <strong>. No inline styles.

Rules:
- Lead with one factual sentence: what it is, who it's for, and the differentiator.
- Then a <ul> of 4-7 attribute bullets: material, dimensions, origin, care, compatibility, warranty — only what the source actually states. Do NOT invent facts.
- End with a 1-2 sentence use-case paragraph.
- Preserve the brand's voice from the input.
- Length: 120-220 words.
- Never invent prices, dates, or awards.`;

export async function generateCopyRewrite(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
): Promise<PageEdit> {
  const handle =
    proposal.productHandle ??
    (typeof ctx.handle === "string" ? (ctx.handle as string) : "");
  if (!handle) {
    throw new Error("generateCopyRewrite: productHandle required");
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      kind: "copy",
      productHandle: handle,
      descriptionHtml: typeof ctx.description === "string" ? (ctx.description as string) : "",
      rationale: proposal.rationale || "Copy unchanged (no LLM available).",
    };
  }

  try {
    const client = new OpenAI();
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 900,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Product context:\n${JSON.stringify(ctx, null, 2)}` },
      ],
    });
    const html = (res.choices[0]?.message?.content ?? "").trim();
    return {
      kind: "copy",
      productHandle: handle,
      descriptionHtml: html,
      rationale: proposal.rationale || "Rewrite product copy for AI-search citability.",
    };
  } catch (err) {
    return {
      kind: "copy",
      productHandle: handle,
      descriptionHtml: typeof ctx.description === "string" ? (ctx.description as string) : "",
      rationale:
        proposal.rationale ||
        `Copy unchanged (LLM error: ${err instanceof Error ? err.message : "unknown"}).`,
    };
  }
}
