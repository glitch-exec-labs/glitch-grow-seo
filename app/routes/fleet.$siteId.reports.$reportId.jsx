import { Link, useLoaderData } from "react-router";
import prisma from "../db.server";
import { findFleetSite } from "../agent/fleet";

/**
 * /fleet/:siteId/reports/:reportId?token=$ADMIN_TOKEN — one report detail.
 */
export const loader = async ({ request, params }) => {
  const expected = process.env.ADMIN_TOKEN;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-admin-token") || "";
  if (!expected || token !== expected) return new Response("unauthorized", { status: 401 });

  const site = params.siteId ? findFleetSite(params.siteId) : null;
  if (!site) return new Response("unknown site", { status: 404 });

  const report = await prisma.seoReport.findFirst({
    where: { id: params.reportId, siteId: site.id },
  });
  if (!report) return new Response("report not found", { status: 404 });
  return { site, report, token };
};

export default function FleetReportDetail() {
  const { site, report, token } = useLoaderData();
  const summary = report.summary || {};
  const gsc = report.gsc || {};
  const perf = report.perf || {};
  const entities = report.entities || {};
  const serp = report.serp || {};

  return (
    <div style={page}>
      <p><Link to={`/fleet/${site.id}/reports?token=${token}`}>← {site.name} reports</Link></p>
      <h1 style={h1}>Report · {new Date(report.createdAt).toLocaleString()}</h1>
      <p style={sub}><code>{report.id}</code> · period {report.period} · kind {report.kind}</p>

      {report.error && <div style={banner}>Error: {report.error}</div>}

      <h2 style={h2}>Summary</h2>
      <table style={kv}>
        <tbody>
          <tr><th style={kth}>Clicks (28d)</th><td style={ktd}>{summary.clicks ?? 0}</td></tr>
          <tr><th style={kth}>Impressions (28d)</th><td style={ktd}>{summary.impressions ?? 0}</td></tr>
          <tr><th style={kth}>Avg CTR</th><td style={ktd}>{typeof summary.avg_ctr === "number" ? (summary.avg_ctr * 100).toFixed(2) + "%" : "—"}</td></tr>
          <tr><th style={kth}>Avg position</th><td style={ktd}>{typeof summary.avg_position === "number" ? summary.avg_position.toFixed(1) : "—"}</td></tr>
          <tr><th style={kth}>PSI median</th><td style={ktd}>{typeof summary.psi_median_performance === "number" ? Math.round(summary.psi_median_performance * 100) + " / 100" : "—"} ({summary.psi_sample_size ?? 0} URLs)</td></tr>
        </tbody>
      </table>

      {Array.isArray(summary.top_entities) && summary.top_entities.length > 0 && (
        <>
          <h2 style={h2}>Top entities</h2>
          <p>{summary.top_entities.join(" · ")}</p>
        </>
      )}

      {Array.isArray(gsc.top_queries) && gsc.top_queries.length > 0 && (
        <>
          <h2 style={h2}>Top {gsc.top_queries.length} queries</h2>
          <table style={table}>
            <thead><tr><th style={th}>Query</th><th style={th}>Clicks</th><th style={th}>Impressions</th><th style={th}>CTR</th><th style={th}>Pos</th></tr></thead>
            <tbody>
              {gsc.top_queries.slice(0, 20).map((q, i) => (
                <tr key={i} style={tr}>
                  <td style={td}>{q.query}</td>
                  <td style={td}>{q.clicks}</td>
                  <td style={td}>{q.impressions}</td>
                  <td style={td}>{(q.ctr * 100).toFixed(2)}%</td>
                  <td style={td}>{q.position?.toFixed?.(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {Array.isArray(gsc.top_pages) && gsc.top_pages.length > 0 && (
        <>
          <h2 style={h2}>Top {gsc.top_pages.length} pages</h2>
          <table style={table}>
            <thead><tr><th style={th}>Page</th><th style={th}>Clicks</th><th style={th}>Impressions</th><th style={th}>CTR</th><th style={th}>Pos</th></tr></thead>
            <tbody>
              {gsc.top_pages.slice(0, 20).map((p, i) => (
                <tr key={i} style={tr}>
                  <td style={td}><a href={p.page} target="_blank" rel="noreferrer">{p.page}</a></td>
                  <td style={td}>{p.clicks}</td>
                  <td style={td}>{p.impressions}</td>
                  <td style={td}>{(p.ctr * 100).toFixed(2)}%</td>
                  <td style={td}>{p.position?.toFixed?.(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {Array.isArray(perf.audits) && perf.audits.length > 0 && (
        <>
          <h2 style={h2}>PageSpeed Insights</h2>
          <table style={table}>
            <thead><tr><th style={th}>URL</th><th style={th}>Perf</th><th style={th}>LCP</th><th style={th}>CLS</th><th style={th}>TBT</th></tr></thead>
            <tbody>
              {perf.audits.map((a, i) => (
                <tr key={i} style={tr}>
                  <td style={td}><a href={a.url} target="_blank" rel="noreferrer">{a.url}</a></td>
                  <td style={td}>{typeof a.scores?.performance === "number" ? Math.round(a.scores.performance * 100) : (a.error ? "ERR" : "—")}</td>
                  <td style={td}>{a.metrics?.lcp_ms != null ? `${Math.round(a.metrics.lcp_ms)}ms` : "—"}</td>
                  <td style={td}>{a.metrics?.cls != null ? a.metrics.cls.toFixed(3) : "—"}</td>
                  <td style={td}>{a.metrics?.tbt_ms != null ? `${Math.round(a.metrics.tbt_ms)}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {Array.isArray(entities.pages) && entities.pages.length > 0 && (
        <>
          <h2 style={h2}>Entities per page</h2>
          {entities.pages.map((p, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <strong><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></strong>
              {p.error ? (
                <p style={{ color: "#c00", fontSize: 13 }}>{p.error}</p>
              ) : (
                <p style={{ fontSize: 13, color: "#444" }}>
                  {(p.entities || []).slice(0, 20).map((e) => e.name).join(" · ") || "—"}
                </p>
              )}
            </div>
          ))}
        </>
      )}

      {Array.isArray(serp.queries) && serp.queries.length > 0 && (
        <>
          <h2 style={h2}>SERP snapshots (Custom Search)</h2>
          {serp.queries.map((q, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <strong>"{q.query}"</strong>
              {Array.isArray(q.results) && q.results.length > 0 ? (
                <ol style={{ fontSize: 13, color: "#333" }}>
                  {q.results.slice(0, 10).map((r, j) => (
                    <li key={j}>
                      <a href={r.link} target="_blank" rel="noreferrer">{r.title}</a>
                      {" "}<span style={{ color: "#888" }}>{r.displayLink}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ fontSize: 13, color: "#c00" }}>{q.error || "no results"}</p>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const page = { maxWidth: 1080, margin: "40px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a" };
const h1 = { fontSize: 24, margin: "8px 0" };
const h2 = { fontSize: 18, marginTop: 32, marginBottom: 8 };
const sub = { color: "#555", marginBottom: 16 };
const banner = { padding: 12, background: "#fff0f0", color: "#900", borderRadius: 4, marginBottom: 16 };
const kv = { borderCollapse: "collapse", fontSize: 14, marginBottom: 16 };
const kth = { textAlign: "left", padding: "4px 12px 4px 0", fontWeight: 600, color: "#555" };
const ktd = { padding: "4px 0" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 };
const th = { textAlign: "left", padding: "6px 10px", fontWeight: 600, fontSize: 12, color: "#444", borderBottom: "2px solid #eee" };
const tr = { borderBottom: "1px solid #f4f4f4" };
const td = { padding: "8px 10px", verticalAlign: "top" };
