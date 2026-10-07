import { attachmentOperations, isManagedAttachment, isManagedProfileUpload } from "./attachmentOperations.js";
import { getConfig, request } from "./main.js";
import { monitoredCleanup } from "./cleanupHealth.js";

const DAY = 24 * 60 * 60 * 1000;
const query = (method, attribute, values) => JSON.stringify({ method, ...(attribute ? { attribute } : {}), ...(values ? { values } : {}) });

// A separate, non-client-executable function shares the send protocol and package.
export default async ({ req, res, error }) => {
  if (req.headers?.["x-appwrite-trigger"] !== "schedule"
      || req.headers?.["x-appwrite-user-id"] || req.headers?.["x-appwrite-user-jwt"]) {
    return res.json({ message: "Scheduled execution required" }, 403);
  }
  try {
    const deadline = Date.now() + 40_000;
    const boundedRequest = (config, ...args) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Cleanup deadline reached");
      return request({ ...config, requestTimeoutMs: Math.min(5_000, remaining) }, ...args);
    };
    const config = getConfig(req);
    const result = await monitoredCleanup(config,
      (configuration, ...args) => request({ ...configuration, requestTimeoutMs: 5_000 }, ...args),
      report => sweepAttachments(config, boundedRequest, { deadline, report }));
    return res.json(result, 200);
  } catch {
    error("Attachment cleanup failed; retry on the next schedule");
    return res.json({ message: "Attachment cleanup unavailable" }, 503);
  }
};

export async function sweepAttachments(config, send, { now = new Date(), deadline = Infinity, report = () => {} } = {}) {
  if (!config.attachmentOperationsTableId || !config.chatAttachmentsBucketId) throw new Error("Missing cleanup configuration");
  const path = `/tablesdb/${encodeURIComponent(config.databaseId)}/tables/${encodeURIComponent(config.attachmentOperationsTableId)}/rows`;
  const operations = attachmentOperations(send);
  const profileOperations = attachmentOperations(send, { profile: true });
  const summary = { checked: 0, discarded: 0, referenced: 0, deferred: 0, failed: 0 };
  const capacity = { due: null, unscheduled: null, oldestDueAt: null, oldestUnscheduledAt: null, batchLimitReached: false, deadlineReached: false };
  const publish = () => report({ ...summary, ...capacity, capacityPerRun: 20 });
  // Reserve half the batch for pre-migration rows. Advancing nextCheckAt rotates
  // the queue, including failing rows, without deleting immutable decisions.
  for (const legacy of [false, true]) {
    if (Date.now() >= deadline) { capacity.deadlineReached = true; publish(); break; }
    const filters = [query("equal", "kind", ["reserved"]), query("limit", null, [10]),
      legacy ? query("isNull", "nextCheckAt") : query("lessThanEqual", "nextCheckAt", [now.toISOString()]),
      query("orderAsc", legacy ? "$createdAt" : "nextCheckAt")];
    const page = await send(config, "GET", path, undefined, filters);
    if (!Array.isArray(page.rows) || page.rows.length > 10) throw new Error("Invalid cleanup page");
    capacity[legacy ? "unscheduled" : "due"] = Number.isInteger(page.total) ? page.total : null;
    capacity[legacy ? "oldestUnscheduledAt" : "oldestDueAt"] = page.rows[0]?.[legacy ? "$createdAt" : "nextCheckAt"] ?? null;
    capacity.batchLimitReached ||= page.rows.length === 10 && (page.total == null || page.total > 10);
    publish();
    for (const row of page.rows) {
      if (Date.now() >= deadline) { capacity.deadlineReached = true; publish(); break; }
      summary.checked += 1;
      // Only reservations with consistent IDs may authorize storage mutations.
      let nextCheckAt = new Date(now.getTime() + DAY);
      try {
        if (row.kind !== "reserved" || (!isManagedAttachment(row.$id) && !isManagedProfileUpload(row.$id)) || row.$id !== row.fileId) {
          throw new Error("Invalid reservation");
        }
        const createdAt = Date.parse(row.$createdAt);
        if (!Number.isFinite(createdAt)) throw new Error("Missing reservation age");
        if (createdAt + DAY > now.getTime()) {
          nextCheckAt = new Date(createdAt + DAY);
          summary.deferred += 1;
        } else {
          const service = isManagedProfileUpload(row.fileId) ? profileOperations : operations;
          const result = await service.reconcile(config, row.ownerUserId, row.threadId, row.fileId);
          summary[result.status] += 1;
          // Committed references cannot turn into discard decisions. Check them
          // less often; discarded files must be revisited for late Storage writes.
          if (result.status === "referenced") nextCheckAt = new Date(now.getTime() + 30 * DAY);
        }
      } catch {
        summary.failed += 1;
        nextCheckAt = new Date(now.getTime() + 60 * 60 * 1000);
      }
      // Patch only scheduling metadata, never binding fields or decision rows.
      try {
        await send(config, "PATCH", `${path}/${encodeURIComponent(row.$id)}`, { data: { nextCheckAt: nextCheckAt.toISOString() } });
      } catch { summary.failed += 1; }
      publish();
    }
  }
  return summary;
}
