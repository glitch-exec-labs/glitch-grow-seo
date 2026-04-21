/**
 * HTML connector — stub for plain-HTML / custom-site targets.
 *
 * crawlSample() fetches the base URL so the core auditor can exercise
 * the full contract across more than one platform. applyEdit / verify /
 * fetchContext will land when we decide on the write strategy (file
 * patches over git, SFTP upload, or PR-gated flow).
 */
import type {
  Connector,
  PageEdit,
  PageSample,
  VerifyResult,
} from "../types";

const USER_AGENT = "GlitchSEO-Agent/0.2";

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

    async fetchContext(_scope, _handle): Promise<Record<string, unknown>> {
      return { url: normalized, name: normalized };
    },

    async applyEdit(_edit: PageEdit): Promise<void> {
      throw new Error("htmlConnector.applyEdit: not implemented");
    },

    async verify(_url, _expect): Promise<VerifyResult> {
      throw new Error("htmlConnector.verify: not implemented");
    },
  };
}
