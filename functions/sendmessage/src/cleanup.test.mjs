import test from "node:test";
import assert from "node:assert/strict";
import handler, { sweepAttachments } from "./cleanup.js";
import { readFileSync } from "node:fs";

const now = new Date("2026-10-05T12:00:00Z");
const day = 86_400_000;
const config = { databaseId: "db", attachmentOperationsTableId: "uploads", chatAttachmentsBucketId: "files" };
const missing = () => Object.assign(new Error("Missing"), { statusCode: 404 });
function backend() {
  const rows = new Map(), files = new Map(), calls = [];
  let failDelete = false;
  const send = async (_, method, path, body, queries) => {
    calls.push({ method, path, body, queries });
    const id = path.split("/").at(-1);
    if (path.includes("/storage/")) {
      if (!files.has(id)) throw missing();
      if (method === "DELETE") {
        if (failDelete) throw new Error("Storage offline");
        files.delete(id);
        return {};
      }
      return files.get(id);
    }
    if (method === "GET" && id === "rows") {
      const filters = queries.map(JSON.parse);
      const legacy = filters.some(q => q.method === "isNull");
      const cutoff = filters.find(q => q.method === "lessThanEqual")?.values[0];
      const sort = legacy ? "$createdAt" : "nextCheckAt";
      const candidates = [...rows.values()].filter(r => r.kind === "reserved" &&
        (legacy ? r.nextCheckAt == null : r.nextCheckAt != null && r.nextCheckAt <= cutoff));
      return { rows: candidates.sort((a, b) => a[sort].localeCompare(b[sort])).slice(0, 10), total: candidates.length };
    }
    if (method === "GET") { if (!rows.has(id)) throw missing(); return rows.get(id); }
    if (method === "POST") {
      if (rows.has(body.rowId)) throw Object.assign(new Error("Conflict"), { statusCode: 409 });
      const row = { $id: body.rowId, ...body.data }; rows.set(row.$id, row); return row;
    }
    if (method === "PATCH") {
      assert.deepEqual(Object.keys(body.data), ["nextCheckAt"]);
      assert.equal(rows.get(id).kind, "reserved");
      rows.set(id, { ...rows.get(id), ...body.data }); return rows.get(id);
    }
    throw new Error(`Unexpected ${method} ${path}`);
  };
  const add = (index, { age = 2 * day, decision, nextCheckAt } = {}) => {
    const id = "u_" + index.toString(16).padStart(32, "0");
    const row = { $id: id, kind: "reserved", ownerUserId: "owner", threadId: "thread", fileId: id,
      messageId: "message", $createdAt: new Date(now - age).toISOString(), nextCheckAt };
    rows.set(id, row);
    files.set(id, { $permissions: ['update("user:owner")', 'delete("user:owner")'] });
    if (decision) rows.set("d_" + id.slice(2), { ...row, $id: "d_" + id.slice(2), kind: decision });
    return id;
  };
  return { send, rows, files, calls, add, setDeleteFailure: value => { failDelete = value; } };
}

test("sweep retains committed files and discards old unused reservations", async () => {
  const db = backend(); const sent = db.add(1, { decision: "committed" }), unused = db.add(2);
  assert.deepEqual(await sweepAttachments(config, db.send, { now }), { checked: 2, referenced: 1, discarded: 1, deferred: 0, failed: 0 });
  assert.ok(db.files.has(sent)); assert.equal(db.files.has(unused), false);
  assert.equal(db.rows.get("d_" + unused.slice(2)).kind, "discarded");
});

test("new reservations and timestamps without a trustworthy age are never deleted", async () => {
  const db = backend(); const fresh = db.add(1, { age: day - 1 }), unknown = db.add(2);
  delete db.rows.get(unknown).$createdAt;
  // Provide one dated and one uninitialized row so missing metadata reaches validation.
  db.rows.get(unknown).nextCheckAt = now.toISOString();
  const result = await sweepAttachments(config, db.send, { now });
  assert.equal(result.deferred, 1); assert.equal(result.failed, 1);
  assert.ok(db.files.has(fresh)); assert.ok(db.files.has(unknown));
  assert.equal(db.calls.filter(c => c.method === "DELETE").length, 0);
});

test("bounded batches advance both dated and pre-migration queues", async () => {
  const db = backend();
  for (let i = 1; i <= 30; i++) db.add(i, { nextCheckAt: i <= 15 ? now.toISOString() : undefined });
  const first = await sweepAttachments(config, db.send, { now });
  assert.equal(first.checked, 20);
  assert.equal(db.files.size, 10);
  const second = await sweepAttachments(config, db.send, { now });
  assert.equal(second.checked, 10); assert.equal(db.files.size, 0);
  assert.equal(db.rows.size, 60); // Reservations and decisions are retained.
});

test("a failed delete is rescheduled and succeeds on a later run", async () => {
  const db = backend(); const id = db.add(1); db.setDeleteFailure(true);
  const result = await sweepAttachments(config, db.send, { now });
  assert.equal(result.failed, 1); assert.ok(db.files.has(id));
  assert.equal(db.rows.get("d_" + id.slice(2)).kind, "discarded");
  db.setDeleteFailure(false);
  await sweepAttachments(config, db.send, { now: new Date(now.getTime() + 3_600_001) });
  assert.equal(db.files.has(id), false);
});

test("periodic rechecks remove a discarded file recreated by a late storage request", async () => {
  const db = backend(); const id = db.add(1);
  const file = db.files.get(id);
  await sweepAttachments(config, db.send, { now });
  db.files.set(id, file);
  await sweepAttachments(config, db.send, { now: new Date(now.getTime() + day) });
  assert.equal(db.files.has(id), false);
  assert.equal(db.rows.get("d_" + id.slice(2)).kind, "discarded");
});

test("wrong storage ownership is retained and deadline stops work before HTTP", async () => {
  const db = backend(); const id = db.add(1); db.files.set(id, { $permissions: [] });
  assert.equal((await sweepAttachments(config, db.send, { now })).failed, 1);
  assert.ok(db.files.has(id));
  const count = db.calls.length;
  await sweepAttachments(config, db.send, { now, deadline: 0 });
  assert.equal(db.calls.length, count);
});

test("cleanup entrypoint refuses HTTP, user executions and missing injected credentials", async () => {
  for (const headers of [{}, { "x-appwrite-trigger": "http" }, { "x-appwrite-trigger": "schedule", "x-appwrite-user-id": "owner" }]) {
    const result = await handler({ req: { headers }, res: { json: (body, status) => ({ body, status }) }, error() {} });
    assert.equal(result.status, 403);
  }
  const result = await handler({ req: { headers: { "x-appwrite-trigger": "schedule" } }, res: { json: (body, status) => ({ body, status }) }, error() {} });
  assert.equal(result.status, 503);
});

test("scheduled function has no client permission and shares storage configuration with the API", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../../appwrite/functions.json", import.meta.url)));
  const send = manifest.find(f => f.$id === "fyre-api"), cleanup = manifest.find(f => f.$id === "cleanupattachments");
  assert.deepEqual(cleanup.execute, []); assert.equal(cleanup.interval, 60); assert.ok(!cleanup.schedule);
  for (const [key, value] of Object.entries(cleanup.vars)) assert.equal(send.vars[key], value, key); assert.equal(send.path, "../functions");
  assert.equal(cleanup.path, "../functions/sendmessage");
  assert.equal(cleanup.entrypoint, "src/cleanup.js");
});

test("capacity observations expose backlog without leaking reservation IDs", async () => {
  const db = backend(); const observed = [];
  for (let i = 1; i <= 15; i++) db.add(i, { nextCheckAt: now.toISOString() });
  await sweepAttachments(config, db.send, { now, report: state => observed.push(state) });
  const final = observed.at(-1);
  assert.equal(final.due, 15); assert.equal(final.unscheduled, 0);
  assert.equal(final.batchLimitReached, true); assert.equal(final.capacityPerRun, 20);
  assert.equal(final.checked, 10); assert.ok(!JSON.stringify(observed).includes("owner"));
});

test("profile reservations are cleaned only in the avatar bucket", async () => {
  const db = backend(); const old = db.add(1);
  const id = "p_" + old.slice(2), row = db.rows.get(old), file = db.files.get(old);
  db.rows.delete(old); db.files.delete(old);
  db.rows.set(id, { ...row, $id: id, fileId: id, threadId: "profile", messageId: "owner" });
  db.files.set(id, file);
  await sweepAttachments({ ...config, avatarsBucketId: "avatars" }, db.send, { now });
  assert.equal(db.files.has(id), false);
  assert.ok(db.calls.some(c => c.method === "DELETE" && c.path.includes("/buckets/avatars/")));
});

test("one failed rescheduling write does not prevent progress on the next reservation", async () => {
  const db = backend(); db.add(1); db.add(2);
  let rejected = false;
  const request = async (...args) => {
    if (args[1] === "PATCH" && !rejected) { rejected = true; throw new Error("timeout"); }
    return db.send(...args);
  };
  const result = await sweepAttachments(config, request, { now });
  assert.equal(result.checked, 2); assert.equal(result.failed, 1); assert.equal(db.files.size, 0);
});
