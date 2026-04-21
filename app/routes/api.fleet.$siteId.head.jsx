import prisma from "../db.server";
import { findFleetSite } from "../agent/fleet";

/**
 * GET /api/fleet/:siteId/head?path=/some/path
 *
 * Returns the JSON-LD blocks + meta tag overrides the agent has
 * published for a given site + page path. Astro sites call this at
 * build time from <SeoHead siteId="..." path={Astro.url.pathname} />.
 *
 * Auth: Bearer $FLEET_API_TOKEN (shared across the fleet — this is
 * build-time infra, not end-user auth).
 *
 * Response shape:
 *   {
 *     jsonld: [ {...schema1}, {...schema2}, ... ],
 *     meta: { title: string|null, description: string|null }
 *   }
 */
export const loader = async ({ request, params }) => {
  const expected = process.env.FLEET_API_TOKEN;
  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  const siteId = params.siteId;
  if (!siteId || !findFleetSite(siteId)) {
    return new Response("unknown_site", { status: 404 });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "/";

  // Shop-wide artifacts always apply; page-specific artifacts match pageKey=path.
  const rows = await prisma.publishedArtifact.findMany({
    where: {
      siteId,
      OR: [
        { scope: "shop", pageKey: "__shop" },
        { scope: "product", pageKey: path },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  const jsonld = rows.filter((r) => r.kind === "jsonld").map((r) => r.content);

  // Page-level meta wins over shop-level; shop-level is the fallback.
  const shopMeta = rows.find((r) => r.kind === "meta" && r.scope === "shop")?.content;
  const pageMeta = rows.find((r) => r.kind === "meta" && r.scope === "product")?.content;
  const meta = {
    title: (pageMeta && "title" in pageMeta ? pageMeta.title : null)
         ?? (shopMeta && "title" in shopMeta ? shopMeta.title : null),
    description: (pageMeta && "description" in pageMeta ? pageMeta.description : null)
         ?? (shopMeta && "description" in shopMeta ? shopMeta.description : null),
  };

  return Response.json(
    { jsonld, meta },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
};
