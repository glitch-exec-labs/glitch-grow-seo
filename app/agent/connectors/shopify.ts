/**
 * Shopify connector — the production platform adapter.
 *
 * Reads via Admin GraphQL + storefront fetch. Writes via:
 *   - shop + product metafields (Admin GraphQL metafieldsSet)
 *   - productUpdate for copy rewrites
 *   - urlRedirectCreate for /llms.txt
 *
 * All writes land under the `glitch_grow_seo` metafield namespace so
 * merchants can see exactly what the agent changed and the Theme App
 * Extension has a stable key to read.
 */
import type {
  Connector,
  PageEdit,
  PageSample,
  VerifyResult,
} from "../types";

type AdminGraphQL = {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const USER_AGENT = "GlitchSEO-Agent/0.2";
const NS = "glitch_grow_seo";

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function shopifyConnector(
  admin: AdminGraphQL,
  shopDomain: string,
  opts?: { appProxySubpath?: string },
): Connector {
  const appProxySubpath = opts?.appProxySubpath ?? "apps/glitch-grow-seo";

  return {
    platform: "shopify",
    siteId: shopDomain,

    async crawlSample(crawlOpts) {
      const maxPages = crawlOpts?.maxPages ?? 4;
      const ctxRes = await admin.graphql(`#graphql
        {
          shop {
            primaryDomain { url }
            myshopifyDomain
          }
          products(first: 1) { edges { node { onlineStoreUrl handle } } }
          collections(first: 1) { edges { node { onlineStoreUrl handle } } }
          articles(first: 1) { edges { node { onlineStoreUrl } } }
        }
      `);
      const ctx = (await ctxRes.json()).data;
      const base =
        ctx.shop.primaryDomain?.url || `https://${ctx.shop.myshopifyDomain}`;
      const targets: Array<{ url: string | null; role: PageSample["role"] }> = [
        { url: base, role: "home" },
        { url: ctx.products.edges[0]?.node?.onlineStoreUrl ?? null, role: "product" },
        { url: ctx.collections.edges[0]?.node?.onlineStoreUrl ?? null, role: "collection" },
        { url: ctx.articles?.edges?.[0]?.node?.onlineStoreUrl ?? null, role: "article" },
      ];
      const picked = targets
        .filter((t): t is { url: string; role: PageSample["role"] } => !!t.url)
        .slice(0, maxPages);
      return Promise.all(
        picked.map(async ({ url, role }) => ({
          url,
          role,
          html: await fetchHtml(url),
        })),
      );
    },

    async fetchContext(scope, productHandle) {
      if (scope === "product") {
        if (!productHandle) throw new Error("fetchContext: productHandle required for product scope");
        return fetchProductContext(admin, productHandle);
      }
      return fetchShopContext(admin);
    },

    async applyEdit(edit: PageEdit): Promise<void> {
      switch (edit.kind) {
        case "jsonld":
          return applyJsonLd(admin, edit);
        case "meta":
          return applyMeta(admin, edit);
        case "llmstxt":
          return applyLlmsTxt(admin, edit, shopDomain, appProxySubpath);
        case "copy":
          return applyCopy(admin, edit);
      }
    },

    async verify(url, expect): Promise<VerifyResult> {
      const html = await fetchHtml(url);
      if (html === null) {
        return { url, ok: false, detail: "Fetch failed — could not verify." };
      }
      const ok = expect(html);
      return {
        url,
        ok,
        detail: ok
          ? "Verified: expected HTML signal is present."
          : "Not yet visible in rendered HTML (theme extension may need enabling, or CDN cache is warm).",
      };
    },
  };
}

/* ─── Shop / Product context ──────────────────────────────────────── */

async function fetchShopContext(admin: AdminGraphQL): Promise<Record<string, unknown>> {
  const res = await admin.graphql(`#graphql
    {
      shop {
        name
        email
        description
        primaryDomain { url }
        brand { logo { image { url } } }
      }
    }
  `);
  const shop = (await res.json()).data.shop;
  return {
    name: shop.name,
    email: shop.email,
    description: shop.description,
    url: shop.primaryDomain?.url,
    logoUrl: shop.brand?.logo?.image?.url ?? null,
  };
}

async function fetchProductContext(
  admin: AdminGraphQL,
  handle: string,
): Promise<Record<string, unknown>> {
  const res = await admin.graphql(
    `#graphql
      query($handle: String!) {
        shop { primaryDomain { url } name }
        productByHandle(handle: $handle) {
          id
          title
          handle
          descriptionHtml
          vendor
          tags
          onlineStoreUrl
          images(first: 5) { edges { node { url } } }
          variants(first: 1) {
            edges { node { sku barcode price availableForSale } }
          }
          collections(first: 1) {
            edges { node { title handle onlineStoreUrl } }
          }
        }
      }`,
    { variables: { handle } },
  );
  const data = (await res.json()).data;
  const p = data.productByHandle;
  if (!p) return { handle };
  const shop = data.shop;
  const variant = p.variants.edges[0]?.node;
  const firstCollection = p.collections.edges[0]?.node;
  return {
    handle: p.handle,
    id: p.id,
    title: p.title,
    description: p.descriptionHtml,
    vendor: p.vendor,
    tags: p.tags,
    url: p.onlineStoreUrl,
    imageUrls: p.images.edges.map((e: { node: { url: string } }) => e.node.url),
    sku: variant?.sku,
    gtin: variant?.barcode,
    price: variant?.price,
    currency: undefined, // Admin API returns price as string; currency inferred shop-wide.
    availability: variant?.availableForSale ? "InStock" : "OutOfStock",
    collectionTitle: firstCollection?.title,
    collectionUrl: firstCollection?.onlineStoreUrl,
    shopUrl: shop.primaryDomain?.url,
    shopName: shop.name,
  };
}

/* ─── Write paths ─────────────────────────────────────────────────── */

async function applyJsonLd(admin: AdminGraphQL, edit: PageEdit & { kind: "jsonld" }) {
  const key =
    edit.scope === "shop"
      ? keyForShopJsonLd(edit.schema["@type"] as string | undefined)
      : keyForProductJsonLd(edit.schema["@type"] as string | undefined);

  if (edit.scope === "shop") {
    const shopId = await shopGid(admin);
    await setMetafields(admin, [
      {
        ownerId: shopId,
        namespace: NS,
        key,
        type: "json",
        value: JSON.stringify(edit.schema),
      },
    ]);
    return;
  }
  // product scope
  if (!edit.productHandle) throw new Error("applyJsonLd: productHandle required");
  const productId = await productGidByHandle(admin, edit.productHandle);
  await setMetafields(admin, [
    {
      ownerId: productId,
      namespace: NS,
      key,
      type: "json",
      value: JSON.stringify(edit.schema),
    },
  ]);
}

function keyForShopJsonLd(atType: string | undefined): string {
  switch (atType) {
    case "WebSite": return "jsonld_website";
    case "FAQPage": return "jsonld_faq";
    case "Organization":
    default: return "jsonld_organization";
  }
}
function keyForProductJsonLd(atType: string | undefined): string {
  switch (atType) {
    case "BreadcrumbList": return "jsonld_breadcrumb";
    case "Product":
    default: return "jsonld_product";
  }
}

async function applyMeta(admin: AdminGraphQL, edit: PageEdit & { kind: "meta" }) {
  const mfs: MetafieldInput[] = [];
  const ownerId =
    edit.scope === "shop"
      ? await shopGid(admin)
      : await productGidByHandle(admin, edit.productHandle ?? "");
  if (edit.title) {
    mfs.push({ ownerId, namespace: NS, key: "meta_title", type: "single_line_text_field", value: edit.title });
  }
  if (edit.description) {
    mfs.push({ ownerId, namespace: NS, key: "meta_description", type: "single_line_text_field", value: edit.description });
  }
  if (mfs.length) await setMetafields(admin, mfs);
}

async function applyLlmsTxt(
  admin: AdminGraphQL,
  edit: PageEdit & { kind: "llmstxt" },
  _shopDomain: string,
  appProxySubpath: string,
) {
  const shopId = await shopGid(admin);
  // Store content in a shop metafield — the /llms.txt app route reads it
  // on each request so merchants can edit and republish without redeploy.
  await setMetafields(admin, [
    {
      ownerId: shopId,
      namespace: NS,
      key: "llmstxt",
      type: "multi_line_text_field",
      value: edit.content,
    },
  ]);
  // Ensure storefront /llms.txt redirects to the app-proxy route. Idempotent.
  await ensureLlmsTxtRedirect(admin, appProxySubpath);
}

async function applyCopy(admin: AdminGraphQL, edit: PageEdit & { kind: "copy" }) {
  const id = await productGidByHandle(admin, edit.productHandle);
  const mutation = `#graphql
    mutation($input: ProductInput!) {
      productUpdate(input: $input) {
        userErrors { field message }
        product { id }
      }
    }`;
  const res = await admin.graphql(mutation, {
    variables: { input: { id, descriptionHtml: edit.descriptionHtml } },
  });
  const json = await res.json();
  const errs = json.data?.productUpdate?.userErrors ?? [];
  if (errs.length) throw new Error(`productUpdate: ${errs.map((e: { message: string }) => e.message).join("; ")}`);
}

/* ─── Low-level helpers ───────────────────────────────────────────── */

type MetafieldInput = {
  ownerId: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
};

async function setMetafields(admin: AdminGraphQL, metafields: MetafieldInput[]) {
  const res = await admin.graphql(
    `#graphql
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    { variables: { metafields } },
  );
  const json = await res.json();
  const errs = json.data?.metafieldsSet?.userErrors ?? [];
  if (errs.length) throw new Error(`metafieldsSet: ${errs.map((e: { message: string }) => e.message).join("; ")}`);
}

async function shopGid(admin: AdminGraphQL): Promise<string> {
  const res = await admin.graphql(`#graphql { shop { id } }`);
  const json = await res.json();
  return json.data.shop.id;
}

async function productGidByHandle(admin: AdminGraphQL, handle: string): Promise<string> {
  const res = await admin.graphql(
    `#graphql query($handle: String!) { productByHandle(handle: $handle) { id } }`,
    { variables: { handle } },
  );
  const json = await res.json();
  const id = json.data?.productByHandle?.id;
  if (!id) throw new Error(`productByHandle: not found for handle=${handle}`);
  return id;
}

async function ensureLlmsTxtRedirect(admin: AdminGraphQL, appProxySubpath: string) {
  // Shopify's URL Redirects only operate within the primary domain.
  // /llms.txt → /apps/<subpath>/llms.txt which is routed to our app.
  const target = `/${appProxySubpath.replace(/^\/+/, "")}/llms.txt`;
  const listRes = await admin.graphql(
    `#graphql
      { urlRedirects(first: 50, query: "path:/llms.txt") { edges { node { id path target } } } }`,
  );
  const existing = (await listRes.json()).data?.urlRedirects?.edges?.find(
    (e: { node: { path: string } }) => e.node.path === "/llms.txt",
  );
  if (existing) {
    if (existing.node.target === target) return; // already correct
    await admin.graphql(
      `#graphql
        mutation($id: ID!, $redirect: UrlRedirectInput!) {
          urlRedirectUpdate(id: $id, urlRedirect: $redirect) {
            userErrors { field message }
          }
        }`,
      { variables: { id: existing.node.id, redirect: { path: "/llms.txt", target } } },
    );
    return;
  }
  await admin.graphql(
    `#graphql
      mutation($redirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $redirect) {
          userErrors { field message }
        }
      }`,
    { variables: { redirect: { path: "/llms.txt", target } } },
  );
}
