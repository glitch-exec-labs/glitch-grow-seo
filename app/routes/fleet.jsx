import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { loadFleet } from "../agent/fleet";

/**
 * /fleet — operator view of the fleet's audit state.
 *
 * Unauthenticated but gated by a shared token — either query param
 * `?token=$ADMIN_TOKEN` or header `x-admin-token`. This is a self-use
 * page, not for customers; the token is a speed bump against accidental
 * exposure, not a security boundary.
 */
export const loader = async ({ request }) => {
  const expected = process.env.ADMIN_TOKEN;
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-admin-token") || url.searchParams.get("token") || "";
  if (!expected || provided !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  const fleet = loadFleet();
  if (!fleet.length) {
    return { fleet: [], rows: [] };
  }

  // Latest AgentRun per fleet site.
  const latest = await prisma.$queryRawUnsafe(
    `
    SELECT DISTINCT ON ("siteId") "siteId", id, "createdAt", summary, "plannerSkipped", "plannerModel", error
    FROM "AgentRun"
    WHERE "siteId" = ANY($1::text[])
    ORDER BY "siteId", "createdAt" DESC
    `,
    fleet.map((s) => s.id),
  );

  const bySiteId = new Map();
  for (const row of Array.isArray(latest) ? latest : []) {
    bySiteId.set(row.siteId, row);
  }

  const rows = fleet.map((site) => ({
    site,
    latest: bySiteId.get(site.id) ?? null,
  }));

  return { fleet, rows };
};

export default function Fleet() {
  const { fleet, rows } = useLoaderData();

  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Glitch Grow AI SEO Agent — Fleet</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        {fleet.length} site{fleet.length === 1 ? "" : "s"} configured.{" "}
        Audits are kicked off via <code>pnpm audit-fleet</code> or the cron endpoint.
      </p>

      {fleet.length === 0 && (
        <div style={{ padding: 16, border: "1px dashed #ccc", borderRadius: 8 }}>
          <p>No fleet configured. Copy <code>fleet.example.json</code> → <code>fleet.json</code> at the repo root, or set <code>FLEET_SITES_JSON</code> in env.</p>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
            <th style={th}>Site</th>
            <th style={th}>URL</th>
            <th style={th}>Platform</th>
            <th style={th}>Last audit</th>
            <th style={th}>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ site, latest }) => {
            const s = latest?.summary || {};
            const total = s.total ?? 0;
            const passing = s.passing ?? 0;
            const pct = total > 0 ? Math.round((passing / total) * 100) : 0;
            return (
              <tr key={site.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={td}><strong>{site.name}</strong><br /><code style={{ fontSize: 12, color: "#888" }}>{site.id}</code></td>
                <td style={td}><a href={site.baseUrl} target="_blank" rel="noreferrer">{site.baseUrl}</a></td>
                <td style={td}>{site.platform}</td>
                <td style={td}>
                  {latest ? new Date(latest.createdAt).toLocaleString() : <em style={{ color: "#999" }}>never</em>}
                  {latest?.plannerSkipped ? (
                    <span style={{ ...chip, background: "#eee" }}>signals-only</span>
                  ) : latest?.plannerModel ? (
                    <span style={{ ...chip, background: "#e3f2fd", color: "#1565c0" }}>{latest.plannerModel}</span>
                  ) : null}
                </td>
                <td style={td}>
                  {latest ? (
                    <>
                      <span style={{ ...chip, background: pct === 100 ? "#d4edda" : pct > 50 ? "#fff3cd" : "#f8d7da" }}>
                        {passing}/{total} ({pct}%)
                      </span>
                      {latest.error && <span style={{ ...chip, background: "#f8d7da" }}>error</span>}
                    </>
                  ) : (
                    <em style={{ color: "#999" }}>—</em>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ marginTop: 24, fontSize: 13, color: "#777" }}>
        LLM mode: <code>{process.env.AGENT_LLM_MODE || "off"}</code>. When off, fleet audits run deterministically with zero OpenAI cost.
      </p>
    </div>
  );
}

const th = { padding: "8px 12px", fontWeight: 600, fontSize: 13, color: "#444" };
const td = { padding: "12px", verticalAlign: "top" };
const chip = {
  display: "inline-block",
  marginLeft: 8,
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
};

export const headers = (headersArgs) => boundary.headers(headersArgs);
