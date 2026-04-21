import { authenticate } from "../shopify.server";
import { previewEdit, shopifyConnector } from "../agent";

/**
 * POST /app/agent/preview — hydrates a planner's EditProposal into a
 * full PageEdit (including any LLM-generated content) so the admin UI
 * can render a diff BEFORE the merchant confirms Apply. No writes.
 *
 * Body: { proposal: EditProposal, signalId?: string }
 * Returns: PageEdit
 */
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();
  const { proposal, signalId } = body ?? {};
  if (!proposal || typeof proposal !== "object") {
    return Response.json({ error: "missing proposal" }, { status: 400 });
  }
  const connector = shopifyConnector(admin, session.shop);
  try {
    const edit = await previewEdit(connector, proposal, signalId);
    return Response.json({ edit });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
};
