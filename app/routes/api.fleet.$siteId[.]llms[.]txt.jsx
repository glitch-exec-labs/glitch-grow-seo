import prisma from "../db.server";
import { findFleetSite } from "../agent/fleet";

/**
 * GET /api/fleet/:siteId/llms.txt — public, no auth.
 *
 * llms.txt is designed to be crawled by AI answer engines; gating it
 * would defeat the purpose. The Astro site's own /llms.txt endpoint
 * proxies this URL so the content lives on the merchant's domain.
 */
export const loader = async ({ params }) => {
  const siteId = params.siteId;
  if (!siteId || !findFleetSite(siteId)) {
    return new Response("unknown site", { status: 404 });
  }
  const row = await prisma.publishedArtifact.findFirst({
    where: { siteId, kind: "llmstxt" },
    orderBy: { updatedAt: "desc" },
  });
  const content =
    row && typeof row.content === "object" && row.content !== null && "content" in row.content
      ? String(row.content.content ?? "")
      : "";

  if (!content) {
    return new Response("# llms.txt not yet published for this site.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
