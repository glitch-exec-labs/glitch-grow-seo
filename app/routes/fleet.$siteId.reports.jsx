import { Link, useLoaderData } from "react-router";
import prisma from "../db.server";
import { findFleetSite } from "../agent/fleet";

/**
 * /fleet/:siteId/reports?token=$ADMIN_TOKEN
 *
 * Report list for one fleet site. Unauthenticated but gated by
 * ADMIN_TOKEN (same speed-bump pattern as /fleet).
 */
export const loader = async ({ request, params }) => {
  const expected = process.env.ADMIN_TOKEN;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-admin-token") || "";
  if (!expected || token !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  const site = params.siteId ? findFleetSite(params.siteId) : null;
  if (!site) return new Response("unknown site", { status: 404 });

  const reports = await prisma.seoReport.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      createdAt: true,
      period: true,
      kind: true,
      summary: true,
      error: true,
    },
  });
  return { site, reports, token };
};

export default function FleetSiteReports() {
  const { site, reports, token } = useLoaderData();
  return (
    <div style={page}>
      <p><Link to={`/fleet?token=${token}`}>← fleet</Link></p>
      <h1 style={h1}>{site.name}</h1>
      <p style={sub}>
        <code>{site.id}</code> · <code>{site.platform}</code> ·{" "}
        <a href={site.baseUrl} target="_blank" rel="noreferrer">{site.baseUrl}</a>
      </p>

      {reports.length === 0 ? (
        <p>No reports yet. Run <code>glitch-seo-agent report {site.id}</code>.</p>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>When</th>
              <th style={th}>GSC (28d)</th>
              <th style={th}>PSI</th>
              <th style={th}>Top entities</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const s = r.summary || {};
              return (
                <tr key={r.id} style={tr}>
                  <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td style={td}>
                    {s.clicks ?? 0} / {s.impressions ?? 0}
                  </td>
                  <td style={td}>
                    {typeof s.psi_median_performance === "number"
                      ? Math.round(s.psi_median_performance * 100)
                      : "—"}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 12, color: "#666" }}>
                      {(s.top_entities || []).slice(0, 5).join(", ") || "—"}
                    </span>
                  </td>
                  <td style={td}>
                    <Link to={`/fleet/${site.id}/reports/${r.id}?token=${token}`}>
                      details →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const page = { maxWidth: 960, margin: "40px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a" };
const h1 = { fontSize: 26, margin: "8px 0" };
const sub = { color: "#555", marginBottom: 24 };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { textAlign: "left", padding: "8px 12px", fontWeight: 600, fontSize: 13, color: "#444", borderBottom: "2px solid #eee" };
const tr = { borderBottom: "1px solid #f0f0f0" };
const td = { padding: "12px", verticalAlign: "top" };
