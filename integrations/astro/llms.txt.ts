/**
 * Glitch Grow AI SEO Agent — Astro /llms.txt endpoint.
 *
 * Place at: src/pages/llms.txt.ts
 *
 * Exposes <your-domain>/llms.txt as text/plain, proxying to the
 * agent's fleet API so the content is editable without rebuilds.
 *
 * Replace "grow-site" with your registered fleet id. The agent's
 * llms.txt endpoint is public (llms.txt is designed to be crawled),
 * so no token is needed here.
 */
export const prerender = false; // SSR so the content stays fresh.

const SITE_ID = "grow-site";
const BASE = import.meta.env.PUBLIC_GLITCH_SEO_URL || "";

export async function GET(): Promise<Response> {
  if (!BASE) {
    return new Response("# llms.txt not configured (missing PUBLIC_GLITCH_SEO_URL).", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  try {
    const res = await fetch(`${BASE}/api/fleet/${SITE_ID}/llms.txt`);
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return new Response(`# llms.txt fetch failed: ${String(err)}`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
