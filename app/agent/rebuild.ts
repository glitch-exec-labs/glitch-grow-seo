/**
 * Same-box fleet rebuilds.
 *
 * When the agent applies a PublishedArtifact for a fleet site with a
 * configured buildDir, we spawn the site's buildCommand locally so
 * static output picks up the new head / llms.txt content. Debounced
 * so a burst of applyEdit calls triggers one rebuild, not many.
 *
 * In-memory state only — rebuild history is not critical; a process
 * restart simply loses the log. Surfaced on /fleet via lastRebuild().
 *
 * Gated by FLEET_AUTO_REBUILD=true. When unset, rebuilds are manual
 * via POST /fleet/:siteId/rebuild (ADMIN_TOKEN).
 */
import { spawn } from "node:child_process";
import { findFleetSite } from "./fleet";

type RebuildState = "idle" | "queued" | "running";
interface Record {
  state: RebuildState;
  lastStartedAt?: Date;
  lastFinishedAt?: Date;
  lastExitCode?: number | null;
  lastError?: string;
  lastStdoutTail?: string;
  lastStderrTail?: string;
  /** Timer handle for the debounce window. */
  timer?: ReturnType<typeof setTimeout>;
}

const DEBOUNCE_MS = 15_000;
const OUTPUT_TAIL = 4_000;

const state = new Map<string, Record>();

export function autoRebuildEnabled(): boolean {
  return process.env.FLEET_AUTO_REBUILD === "true";
}

export function lastRebuild(siteId: string): Record | null {
  return state.get(siteId) ?? null;
}

/**
 * Schedule a rebuild. Multiple calls within DEBOUNCE_MS coalesce into
 * one. If a rebuild is already running, marks the site dirty so
 * another rebuild starts when the current one finishes.
 */
export function scheduleRebuild(siteId: string): void {
  const site = findFleetSite(siteId);
  if (!site || !site.buildDir) return;

  let r = state.get(siteId);
  if (!r) {
    r = { state: "idle" };
    state.set(siteId, r);
  }

  if (r.state === "running") {
    // Mark dirty — runRebuild will re-enqueue on exit.
    r.state = "queued";
    return;
  }

  if (r.timer) clearTimeout(r.timer);
  r.state = "queued";
  r.timer = setTimeout(() => {
    void runRebuild(siteId);
  }, DEBOUNCE_MS);
}

/** Force a rebuild immediately (admin trigger). Bypasses the debounce. */
export async function rebuildNow(siteId: string): Promise<Record> {
  const r = state.get(siteId) ?? { state: "idle" as const };
  state.set(siteId, r);
  if (r.timer) {
    clearTimeout(r.timer);
    r.timer = undefined;
  }
  if (r.state === "running") {
    r.state = "queued";
    return r;
  }
  await runRebuild(siteId);
  return state.get(siteId)!;
}

async function runRebuild(siteId: string): Promise<void> {
  const site = findFleetSite(siteId);
  const r = state.get(siteId);
  if (!site || !site.buildDir || !r) return;

  r.state = "running";
  r.lastStartedAt = new Date();
  r.lastError = undefined;
  r.timer = undefined;

  const cmd = site.buildCommand || "pnpm build";
  let stdoutBuf = "";
  let stderrBuf = "";

  await new Promise<void>((resolve) => {
    const child = spawn("sh", ["-c", cmd], {
      cwd: site.buildDir!,
      env: process.env,
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf = (stdoutBuf + chunk.toString()).slice(-OUTPUT_TAIL);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf = (stderrBuf + chunk.toString()).slice(-OUTPUT_TAIL);
    });
    child.on("error", (err) => {
      r.lastError = err.message;
      resolve();
    });
    child.on("close", (code) => {
      r.lastExitCode = code;
      r.lastFinishedAt = new Date();
      r.lastStdoutTail = stdoutBuf;
      r.lastStderrTail = stderrBuf;
      resolve();
    });
  });

  // If another applyEdit landed while we were running, start a fresh
  // debounce window so we pick up the latest artifacts.
  const wasQueued = r.state === ("queued" as RebuildState);
  r.state = "idle";
  if (wasQueued) scheduleRebuild(siteId);
}
