import { findFleetSite } from "../agent/fleet";
import { rebuildNow } from "../agent/rebuild";

/**
 * POST /fleet/:siteId/rebuild
 *
 * Manual rebuild trigger. ADMIN_TOKEN-gated (query ?token= or
 * x-admin-token header). Bypasses the debounce window.
 *
 * Returns the rebuild record so the operator can see exit code and
 * the tail of stdout/stderr.
 */
export const action = async ({ request, params }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  const expected = process.env.ADMIN_TOKEN;
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-admin-token") || url.searchParams.get("token") || "";
  if (!expected || provided !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const siteId = params.siteId;
  const site = siteId ? findFleetSite(siteId) : null;
  if (!site) return Response.json({ error: "unknown_site" }, { status: 404 });
  if (!site.buildDir) {
    return Response.json(
      { error: "no_buildDir", reason: "Site has no buildDir configured in fleet.json — likely SSR, no rebuild needed." },
      { status: 400 },
    );
  }

  const record = await rebuildNow(siteId);
  return Response.json({ siteId, record });
};
