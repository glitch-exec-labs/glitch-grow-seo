/**
 * Wix connector — stub. Will use Wix Data API + Velo Dev Mode when ready.
 */
import type {
  Connector,
  PageEdit,
  PageSample,
  VerifyResult,
} from "../types";

export function wixConnector(siteId: string): Connector {
  return {
    platform: "wix",
    siteId,

    async crawlSample(_opts): Promise<PageSample[]> {
      throw new Error("wixConnector.crawlSample: not implemented");
    },
    async fetchContext(_scope, _handle): Promise<Record<string, unknown>> {
      throw new Error("wixConnector.fetchContext: not implemented");
    },
    async applyEdit(_edit: PageEdit): Promise<void> {
      throw new Error("wixConnector.applyEdit: not implemented");
    },
    async verify(_url, _expect): Promise<VerifyResult> {
      throw new Error("wixConnector.verify: not implemented");
    },
  };
}
