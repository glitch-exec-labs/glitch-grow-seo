/**
 * Edit generators — hydrate an EditProposal (what the planner wants done)
 * into a concrete PageEdit (what the executor applies).
 *
 * Deterministic generators (Organization, WebSite, Product schema,
 * Breadcrumb) read platform context from `connector.fetchContext()` and
 * build JSON-LD by hand. LLM generators (FAQ, llms.txt, copy, meta
 * description) call OpenAI with shop context for creative output.
 *
 * Every generator is async and returns a full PageEdit. The preview UI
 * shows the result before the executor commits.
 */
import type {
  Connector,
  EditProposal,
  PageEdit,
} from "../types";
import { generateOrganizationSchema } from "./organization";
import { generateWebsiteSchema } from "./website";
import { generateProductSchema } from "./product";
import { generateBreadcrumbSchema } from "./breadcrumb";
import { generateFaqSchema } from "./faq";
import { generateLlmsTxt } from "./llmstxt";
import { generateCopyRewrite } from "./copy";
import { generateMetaDescription } from "./meta";

export async function generateEdit(
  connector: Connector,
  proposal: EditProposal,
  opts?: { signalId?: string },
): Promise<PageEdit> {
  const ctx = await connector.fetchContext(proposal.scope, proposal.productHandle);

  switch (proposal.kind) {
    case "jsonld":
      return await routeJsonLd(proposal, ctx, opts?.signalId);
    case "meta":
      return await generateMetaDescription(proposal, ctx);
    case "llmstxt":
      return await generateLlmsTxt(proposal, ctx);
    case "copy":
      return await generateCopyRewrite(proposal, ctx);
  }
}

async function routeJsonLd(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  signalId?: string,
): Promise<PageEdit> {
  // Route to the right JSON-LD generator using the signal id as a hint.
  // Falls back on scope alone when the signal id isn't carried through.
  const sid = signalId ?? "";
  if (proposal.scope === "shop") {
    if (sid.includes("jsonld.website")) return generateWebsiteSchema(proposal, ctx);
    if (sid.includes("jsonld.faq")) return await generateFaqSchema(proposal, ctx);
    return generateOrganizationSchema(proposal, ctx);
  }
  if (proposal.scope === "product") {
    if (sid.includes("breadcrumb")) return generateBreadcrumbSchema(proposal, ctx);
    return generateProductSchema(proposal, ctx);
  }
  return generateOrganizationSchema(proposal, ctx);
}
