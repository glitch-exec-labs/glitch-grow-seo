import { unauthenticated } from "../shopify.server";

/**
 * GET /llms.txt — public endpoint. Served to AI answer engines.
 *
 * Storefront /llms.txt is 301-redirected (via Shopify URL Redirect
 * configured when the agent applies an llmstxt edit) to
 * `/apps/glitch-grow-seo/llms.txt` which Shopify's app proxy forwards
 * here with ?shop=<store>.myshopify.com. We read the llmstxt metafield
 * the agent wrote and return it as text/plain.
 *
 * No authentication — AI crawlers do not carry session cookies.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return new Response("llms.txt: missing shop query param", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  try {
    const { admin } = await unauthenticated.admin(shop);
    const res = await admin.graphql(`#graphql
      {
        shop {
          metafield(namespace: "glitch_grow_seo", key: "llmstxt") { value }
        }
      }`);
    const json = await res.json();
    const content = json.data?.shop?.metafield?.value ?? "";
    if (!content) {
      return new Response("# llms.txt not yet published by the store agent.", {
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
  } catch (err) {
    return new Response(
      `llms.txt: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
};
