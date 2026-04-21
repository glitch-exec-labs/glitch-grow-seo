import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { runAudit, shopifyConnector } from "../agent";

/**
 * Glitch Grow AI SEO Agent — embedded admin home page.
 *
 * Loader: fetches basic shop context for the dashboard header.
 *
 * Action: kicks off one agent run via the platform-agnostic runner.
 * The runner uses shopifyConnector to crawl a representative page
 * sample, extracts deterministic SEO signals, retrieves prior memory,
 * calls the LLM planner (fail-open), persists an AgentRun + memory
 * row, and returns findings to the UI.
 */

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const shopRes = await admin.graphql(`#graphql
    {
      shop {
        id
        name
        myshopifyDomain
        primaryDomain { url host }
      }
      productsCount { count }
    }`);
  const json = await shopRes.json();
  const shop = json.data.shop;
  const productCount = json.data.productsCount?.count ?? 0;

  return {
    shop,
    storefrontUrl: shop.primaryDomain?.url || `https://${shop.myshopifyDomain}`,
    counts: { products: productCount },
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const connector = shopifyConnector(admin, session.shop);
  const result = await runAudit(connector);
  return result;
};

export default function Index() {
  const { shop, storefrontUrl, counts } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isAuditing = fetcher.state === "submitting" || fetcher.state === "loading";
  const result = fetcher.data;

  useEffect(() => {
    if (result?.summary) {
      const { passing, total } = result.summary;
      shopify.toast.show(`Audit complete: ${passing}/${total} signals passing`);
    }
  }, [result?.runId, shopify]);

  const runAgent = () => fetcher.submit({}, { method: "POST" });

  const groupedSignals = result?.signals?.reduce((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {}) || {};

  return (
    <s-page heading="Glitch Grow AI SEO Agent">
      <s-button slot="primary-action" onClick={runAgent} {...(isAuditing ? { loading: true } : {})}>
        Run AI SEO agent
      </s-button>

      <s-section heading={shop.name}>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text>Store:</s-text>{" "}
            <s-link href={storefrontUrl} target="_blank">{storefrontUrl}</s-link>
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-badge>{counts.products} products</s-badge>
            <s-badge tone="info">Shopify connector</s-badge>
          </s-stack>
          <s-paragraph>
            The agent crawls a representative slice of your storefront,
            extracts deterministic SEO signals (structured data, on-page,
            AI-search), consults its memory of past runs on this store,
            and has an LLM planner synthesize a ranked list of findings
            with recommendations.
          </s-paragraph>
        </s-stack>
      </s-section>

      {result?.summary && (
        <s-section heading={`Run ${result.runId.slice(0, 8)} — ${result.summary.passing}/${result.summary.total} passing`}>
          <s-stack direction="inline" gap="base">
            <s-badge tone={result.summary.passing === result.summary.total ? "success" : "attention"}>
              {result.summary.passing} passing
            </s-badge>
            <s-badge tone={result.summary.failing > 0 ? "critical" : "subdued"}>
              {result.summary.failing} failing
            </s-badge>
            {result.summary.unknown > 0 && (
              <s-badge tone="subdued">{result.summary.unknown} not testable</s-badge>
            )}
            {result.plannerSkipped ? (
              <s-badge tone="subdued">Planner: signals-only</s-badge>
            ) : (
              <s-badge tone="info">Planner: {result.plannerModel}</s-badge>
            )}
          </s-stack>
          <s-paragraph>
            {new Date(result.ranAt).toLocaleString()} · platform: {result.platform}
          </s-paragraph>
        </s-section>
      )}

      {result?.findings?.length > 0 && (
        <s-section heading="Findings">
          <s-stack direction="block" gap="base">
            {result.findings.map((f) => (
              <s-stack key={f.id} direction="block" gap="small">
                <s-stack direction="inline" gap="small">
                  <s-badge
                    tone={
                      f.severity === "critical" ? "critical" :
                      f.severity === "warning" ? "attention" : "subdued"
                    }
                  >
                    {f.severity}
                  </s-badge>
                  <s-text weight="bold">{f.title}</s-text>
                </s-stack>
                <s-paragraph>{f.body}</s-paragraph>
                {f.recommendation && (
                  <s-paragraph>
                    <s-text weight="bold">Recommendation:</s-text> {f.recommendation}
                  </s-paragraph>
                )}
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}

      {Object.entries(groupedSignals).map(([group, items]) => (
        <s-section heading={`Signals · ${group}`} key={group}>
          <s-stack direction="block" gap="small">
            {items.map((a) => (
              <s-stack key={a.id} direction="inline" gap="small">
                <s-text>
                  {a.status === true ? "✅" : a.status === false ? "❌" : "⏳"}
                </s-text>
                <s-text>{a.label}</s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      ))}

      {!result && (
        <s-section heading="What the agent checks">
          <s-unordered-list>
            <s-list-item>Organization / OnlineStore / WebSite JSON-LD</s-list-item>
            <s-list-item>FAQPage, BreadcrumbList, Product schema coverage</s-list-item>
            <s-list-item>Product JSON-LD <code>additionalProperty</code> + <code>aggregateRating</code></s-list-item>
            <s-list-item>Canonical, og:image protocol, semantic H1, meta description</s-list-item>
            <s-list-item>AI-search readiness (<code>llms.txt</code>, citable copy)</s-list-item>
          </s-unordered-list>
          <s-paragraph>
            Click <s-text weight="bold">Run AI SEO agent</s-text> to kick off a run.
          </s-paragraph>
        </s-section>
      )}

      <s-section slot="aside" heading="Agent architecture">
        <s-paragraph>
          The core is platform-agnostic. Connectors for Shopify, HTML, and
          Wix all implement the same capability interface — the same
          auditor, planner, and memory run across every site.
        </s-paragraph>
        <s-paragraph>
          Shopify connector is the only one fully implemented in v0. HTML
          and Wix connectors exist as typed stubs.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
