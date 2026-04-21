import { authenticate } from "../shopify.server";
import { applyEdit, shopifyConnector } from "../agent";

/**
 * POST /app/agent/apply — executes a previewed PageEdit against the
 * Shopify store (metafield writes, productUpdate, or URL redirect) and
 * runs verify() to confirm propagation.
 *
 * Body: { edit: PageEdit, signalId?: string }
 * Returns: { applied: true, verify: VerifyResult | null }
 */
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();
  const { edit, signalId } = body ?? {};
  if (!edit || typeof edit !== "object") {
    return Response.json({ error: "missing edit" }, { status: 400 });
  }
  const connector = shopifyConnector(admin, session.shop);
  try {
    const result = await applyEdit(connector, edit, signalId);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
};
