/**
 * Public surface of the agent module.
 *
 *   import { runAudit, shopifyConnector } from "~/agent";
 *
 * The core is platform-agnostic; pick a connector and hand it to
 * runAudit(). New platforms implement the Connector interface in
 * ./types and drop a file into ./connectors/.
 */
export { runAudit } from "./runner";
export { shopifyConnector } from "./connectors/shopify";
export { htmlConnector } from "./connectors/html";
export { wixConnector } from "./connectors/wix";
export type {
  AgentRunResult,
  Connector,
  Finding,
  PageEdit,
  PageSample,
  Platform,
  Signal,
  VerifyResult,
} from "./types";
