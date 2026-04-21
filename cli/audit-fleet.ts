#!/usr/bin/env node
/**
 * audit-fleet — run the agent against every site in fleet.json.
 *
 * Usage:
 *   pnpm audit-fleet              # audit all sites
 *   pnpm audit-fleet grow-site    # audit just that id
 *
 * Runs deterministically when AGENT_LLM_MODE != "live" (no credits
 * burned). Persists AgentRun rows so /fleet shows the results.
 */
import { loadFleet } from "../app/agent/fleet";
import { htmlConnector } from "../app/agent/connectors/html";
import { runAudit } from "../app/agent/runner";

const onlyId = process.argv[2];
const fleet = loadFleet();
const targets = onlyId ? fleet.filter((s) => s.id === onlyId) : fleet;

if (!targets.length) {
  console.error(
    onlyId
      ? `audit-fleet: no site with id=${onlyId} in fleet.json`
      : "audit-fleet: fleet.json empty or missing (copy fleet.example.json → fleet.json)",
  );
  process.exit(1);
}

console.log(
  `audit-fleet: ${targets.length} site(s), LLM_MODE=${process.env.AGENT_LLM_MODE || "off"}`,
);

let ok = 0, fail = 0;
for (const site of targets) {
  try {
    const connector = htmlConnector(site.baseUrl);
    // Override the connector's siteId so AgentRun is keyed by the
    // fleet id rather than the raw URL — makes /fleet joins simple.
    const scoped = { ...connector, siteId: site.id };
    const start = Date.now();
    const res = await runAudit(scoped);
    const ms = Date.now() - start;
    console.log(
      `  ✓ ${site.id.padEnd(20)} ${res.summary.passing}/${res.summary.total} passing · ${res.findings.length} findings · ${ms}ms`,
    );
    ok++;
  } catch (err) {
    console.error(`  ✗ ${site.id}: ${err instanceof Error ? err.message : String(err)}`);
    fail++;
  }
}
console.log(`audit-fleet: done — ${ok} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
