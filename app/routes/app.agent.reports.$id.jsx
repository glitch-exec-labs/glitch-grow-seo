import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const report = await prisma.seoReport.findFirst({
    where: { id: params.id, siteId: session.shop },
  });
  if (!report) return new Response("Not found", { status: 404 });
  return { report };
};

export default function ReportDetail() {
  const { report } = useLoaderData();
  const summary = report.summary || {};
  const gsc = report.gsc || {};
  const perf = report.perf || {};
  const entities = report.entities || {};

  return (
    <s-page
      heading={`Report · ${new Date(report.createdAt).toLocaleDateString()}`}
      backAction={{ content: "All reports", url: "/app/agent/reports" }}
    >
      <s-section heading="Summary">
        <s-stack direction="inline" gap="base">
          {typeof summary.clicks === "number" && <s-badge>{summary.clicks} clicks</s-badge>}
          {typeof summary.impressions === "number" && (
            <s-badge>{summary.impressions.toLocaleString()} impressions</s-badge>
          )}
          {typeof summary.avg_ctr === "number" && (
            <s-badge>CTR {(summary.avg_ctr * 100).toFixed(2)}%</s-badge>
          )}
          {typeof summary.avg_position === "number" && (
            <s-badge>avg pos {summary.avg_position.toFixed(1)}</s-badge>
          )}
          {typeof summary.psi_median_performance === "number" && (
            <s-badge
              tone={
                summary.psi_median_performance >= 0.9 ? "success" :
                summary.psi_median_performance >= 0.5 ? "attention" : "critical"
              }
            >
              PSI median {Math.round(summary.psi_median_performance * 100)}
              {" "}({summary.psi_sample_size} urls)
            </s-badge>
          )}
        </s-stack>
        <s-paragraph>
          <code>{report.platform}</code> · period: {report.period}
        </s-paragraph>
        {report.error && <s-banner tone="critical">{report.error}</s-banner>}
      </s-section>

      {Array.isArray(summary.top_entities) && summary.top_entities.length > 0 && (
        <s-section heading="Top entities across sampled pages">
          <s-stack direction="inline" gap="small">
            {summary.top_entities.map((e) => (
              <s-badge key={e}>{e}</s-badge>
            ))}
          </s-stack>
        </s-section>
      )}

      {Array.isArray(gsc.top_queries) && gsc.top_queries.length > 0 && (
        <s-section heading={`Top ${gsc.top_queries.length} queries (28d)`}>
          <s-stack direction="block" gap="small">
            {gsc.top_queries.slice(0, 20).map((q, i) => (
              <s-stack key={i} direction="inline" gap="small">
                <s-text>{q.query}</s-text>
                <s-badge>{q.clicks} clicks</s-badge>
                <s-badge tone="subdued">{q.impressions} imp</s-badge>
                <s-badge tone="subdued">pos {q.position?.toFixed?.(1)}</s-badge>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}

      {Array.isArray(gsc.top_pages) && gsc.top_pages.length > 0 && (
        <s-section heading={`Top ${gsc.top_pages.length} pages (28d)`}>
          <s-stack direction="block" gap="small">
            {gsc.top_pages.slice(0, 20).map((p, i) => (
              <s-stack key={i} direction="inline" gap="small">
                <s-link href={p.page} target="_blank">{p.page}</s-link>
                <s-badge>{p.clicks}</s-badge>
                <s-badge tone="subdued">CTR {(p.ctr * 100).toFixed(2)}%</s-badge>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}

      {Array.isArray(perf.audits) && perf.audits.length > 0 && (
        <s-section heading="PageSpeed">
          <s-stack direction="block" gap="small">
            {perf.audits.map((a, i) => (
              <s-stack key={i} direction="inline" gap="small">
                <s-link href={a.url} target="_blank">{a.url}</s-link>
                {a.scores?.performance != null && (
                  <s-badge
                    tone={
                      a.scores.performance >= 0.9 ? "success" :
                      a.scores.performance >= 0.5 ? "attention" : "critical"
                    }
                  >
                    perf {Math.round(a.scores.performance * 100)}
                  </s-badge>
                )}
                {a.metrics?.lcp_ms != null && (
                  <s-badge tone="subdued">LCP {Math.round(a.metrics.lcp_ms)}ms</s-badge>
                )}
                {a.metrics?.cls != null && (
                  <s-badge tone="subdued">CLS {a.metrics.cls.toFixed(3)}</s-badge>
                )}
                {a.error && <s-badge tone="critical">error</s-badge>}
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}

      {Array.isArray(entities.pages) && (
        <s-section heading="Entity extraction per page">
          <s-stack direction="block" gap="small">
            {entities.pages.map((p, i) => (
              <s-stack key={i} direction="block" gap="small">
                <s-link href={p.url} target="_blank">{p.url}</s-link>
                {p.error ? (
                  <s-badge tone="critical">{p.error}</s-badge>
                ) : (
                  <s-stack direction="inline" gap="small">
                    {(p.entities || []).slice(0, 15).map((e, j) => (
                      <s-badge key={j} tone="subdued">{e.name}</s-badge>
                    ))}
                  </s-stack>
                )}
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
