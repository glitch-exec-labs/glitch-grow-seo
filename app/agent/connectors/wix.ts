/**
 * Wix connector — stub.
 *
 * Will use the Wix Data API + Wix Headless for reads, and the Dev Mode
 * / Velo APIs for writes. The contract matches every other connector so
 * the core agent code does not change when this lands.
 */
import type { Connector, PageEdit, PageSample, VerifyResult } from "../types";

export function wixConnector(siteId: string): Connector {
  return {
    platform: "wix",
    siteId,

    async crawlSample(_opts): Promise<PageSample[]> {
      throw new Error("wixConnector.crawlSample: not implemented in v0");
    },

    async applyEdit(_edit: PageEdit): Promise<void> {
      throw new Error("wixConnector.applyEdit: not implemented in v0");
    },

    async verify(_url, _expect): Promise<VerifyResult> {
      throw new Error("wixConnector.verify: not implemented in v0");
    },
  };
}
