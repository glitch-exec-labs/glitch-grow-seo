/**
 * HTML connector — stub for plain-HTML / custom-site targets.
 *
 * The contract is the same as every other connector: given a base URL,
 * surface a representative page sample. v0 implements crawlSample only;
 * writes will come in a later session and will likely land via one of:
 *
 *   - direct filesystem patches (git-backed sites)
 *   - SFTP uploads (shared hosting)
 *   - a PR-generating mode for review-gated sites
 *
 * Today crawlSample just fetches the base URL. It is exported so the
 * connector interface is proven across more than one platform.
 */
import type { Connector, PageEdit, PageSample, VerifyResult } from "../types";

const USER_AGENT = "GlitchSEO-Agent/0.1";

export function htmlConnector(baseUrl: string): Connector {
  const normalized = baseUrl.replace(/\/+$/, "");
  return {
    platform: "html",
    siteId: normalized,

    async crawlSample(_opts): Promise<PageSample[]> {
      try {
        const res = await fetch(normalized, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(8_000),
        });
        const html = res.ok ? await res.text() : null;
        return [{ url: normalized, role: "home", html }];
      } catch {
        return [{ url: normalized, role: "home", html: null }];
      }
    },

    async applyEdit(_edit: PageEdit): Promise<void> {
      throw new Error("htmlConnector.applyEdit: not implemented in v0");
    },

    async verify(_url, _expect): Promise<VerifyResult> {
      throw new Error("htmlConnector.verify: not implemented in v0");
    },
  };
}
