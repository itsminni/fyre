import { randomUUID } from "node:crypto";

// Persist counts and timestamps only. Production function logs may be disabled.
export async function monitoredCleanup(config, send, run, now = () => new Date()) {
  if (!config.cleanupHealthTableId) throw new Error("Missing cleanup monitoring table");
  const started = now();
  const path = `/tablesdb/${encodeURIComponent(config.databaseId)}/tables/${encodeURIComponent(config.cleanupHealthTableId)}/rows`;
  const id = randomUUID().replaceAll("-", "");
  await send(config, "POST", path, { rowId: id, permissions: [], data: {
    startedAt: started.toISOString(), state: "running", summary: "{}"
  } });
  let latest = {};
  try {
    const result = await run(metrics => { latest = metrics; });
    const finished = now();
    const state = result.failed || latest.batchLimitReached || latest.deadlineReached ? "attention" : "healthy";
    await send(config, "PATCH", `${path}/${id}`, { data: {
      finishedAt: finished.toISOString(), state,
      summary: JSON.stringify({ ...latest, ...result, durationMs: finished - started })
    } });
    return result;
  } catch (error) {
    // If this write fails too, the durable "running" row makes the stale run visible.
    try { await send(config, "PATCH", `${path}/${id}`, { data: {
      finishedAt: now().toISOString(), state: "error", summary: JSON.stringify(latest)
    } }); } catch {}
    throw error;
  }
}
