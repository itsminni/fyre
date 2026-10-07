import test from "node:test";
import assert from "node:assert/strict";
import { attachmentOperations, isManagedAttachment } from "./attachmentOperations.js";

const config = { databaseId: "db", messagesTableId: "messages", attachmentOperationsTableId: "uploads", chatAttachmentsBucketId: "files" };
const rowPath = (table, id) => `/tablesdb/db/tables/${table}/rows/${id}`;
const failure = (statusCode) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

function backend() {
  const rows = new Map();
  const files = new Map();
  const transactions = new Map();
  const calls = [];
  let beforeCommit;
  let loseCommitResponse = false;
  let failDelete = false;
  const insert = ({ path, body }) => rows.set(`${path}/${body.rowId}`, { $id: body.rowId, ...body.data, $permissions: body.permissions });
  const request = async (_, method, path, body) => {
    calls.push({ method, path, body });
    if (path.startsWith("/storage/")) {
      const id = path.split("/").at(-1);
      if (!files.has(id)) throw failure(404);
      if (method === "DELETE") { if (failDelete) throw failure(503); files.delete(id); return {}; }
      return files.get(id);
    }
    if (path === "/tablesdb/transactions") {
      const id = `transaction-${transactions.size}`;
      transactions.set(id, []);
      return { $id: id };
    }
    if (path.startsWith("/tablesdb/transactions/")) {
      const id = path.split("/").at(-1);
      if (body.rollback) { transactions.delete(id); return {}; }
      if (beforeCommit) { const callback = beforeCommit; beforeCommit = null; await callback(); }
      const operations = transactions.get(id);
      for (const operation of operations) {
        if (rows.has(`${operation.path}/${operation.body.rowId}`)) throw failure(409);
      }
      operations.forEach(insert);
      transactions.delete(id);
      if (loseCommitResponse) throw failure(504);
      return { $id: id, status: "committed" };
    }
    if (method === "GET") {
      if (!rows.has(path)) throw failure(404);
      return rows.get(path);
    }
    if (method === "POST") {
      if (body.transactionId) transactions.get(body.transactionId).push({ path, body });
      else {
        if (rows.has(`${path}/${body.rowId}`)) throw failure(409);
        insert({ path, body });
      }
      return { $id: body.rowId, ...body.data };
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  };
  const operations = attachmentOperations(request);
  return {
    ...operations, rows, files, calls, request,
    setBeforeCommit: (callback) => { beforeCommit = callback; },
    loseCommit: () => { loseCommitResponse = true; },
    setDeleteFailure: (value) => { failDelete = value; },
    async upload() {
      const { fileId } = await operations.reserve(config, "owner", "thread", "message");
      files.set(fileId, { $id: fileId, $permissions: ['update("user:owner")', 'delete("user:owner")'] });
      return fileId;
    }
  };
}
const message = (fileId) => ({ senderUserId: "owner", threadId: "thread", attachmentFileId: fileId, text: "hello" });

test("reservation allocates a new managed ID with private ledger permissions", async () => {
  const db = backend();
  const first = await db.reserve(config, "owner", "thread", "message");
  const second = await db.reserve(config, "owner", "thread", "message");
  assert.ok(isManagedAttachment(first.fileId));
  assert.notEqual(first.fileId, second.fileId);
  assert.deepEqual(db.rows.get(rowPath("uploads", first.fileId)).$permissions, []);
});

test("disabled capability preserves legacy behavior without database calls", async () => {
  const db = backend();
  assert.deepEqual(await db.reserve({ ...config, attachmentOperationsTableId: null }, "owner", "thread", "message"), { supported: false });
  assert.equal(db.calls.length, 0);
});

test("committed message and decision are atomic and cleanup retains the file", async () => {
  const db = backend(); const id = await db.upload();
  await db.createMessage(config, "message", message(id), ['read("user:owner")']);
  assert.ok(db.rows.has(rowPath("messages", "message")));
  assert.deepEqual(await db.reconcile(config, "owner", "thread", id), { status: "referenced", fileId: id, messageId: "message" });
  assert.ok(db.files.has(id));
  assert.equal(db.calls.filter(c => c.method === "DELETE").length, 0);
});

test("cleanup wins before a staged send commits: no dangling message is created", async () => {
  const db = backend(); const id = await db.upload();
  db.setBeforeCommit(() => db.reconcile(config, "owner", "thread", id));
  await assert.rejects(db.createMessage(config, "message", message(id), []), { statusCode: 409 });
  assert.equal(db.rows.has(rowPath("messages", "message")), false);
  assert.equal(db.files.has(id), false);
  await assert.rejects(db.createMessage(config, "message", message(id), []), { statusCode: 409 });
  assert.equal(db.rows.has(rowPath("messages", "message")), false);
});

test("a lost commit response cannot turn a referenced attachment into an orphan", async () => {
  const db = backend(); const id = await db.upload(); db.loseCommit();
  await assert.rejects(db.createMessage(config, "message", message(id), []), { statusCode: 504 });
  assert.equal((await db.reconcile(config, "owner", "thread", id)).status, "referenced");
  assert.ok(db.files.has(id));
});

test("failed storage deletion remains retryable and keeps the durable decision", async () => {
  const db = backend(); const id = await db.upload(); db.setDeleteFailure(true);
  await assert.rejects(db.reconcile(config, "owner", "thread", id), { statusCode: 503 });
  db.setDeleteFailure(false);
  assert.equal((await db.reconcile(config, "owner", "thread", id)).status, "discarded");
  assert.equal((await db.reconcile(config, "owner", "thread", id)).status, "discarded");
  assert.equal(db.rows.get(rowPath("uploads", `d_${id.slice(2)}`)).kind, "discarded");
});

test("foreign accounts and threads cannot reconcile another reservation", async () => {
  const db = backend(); const id = await db.upload();
  await assert.rejects(db.reconcile(config, "attacker", "thread", id), { statusCode: 403 });
  await assert.rejects(db.reconcile(config, "owner", "other-thread", id), { statusCode: 403 });
  assert.ok(db.files.has(id));
  assert.equal(db.rows.size, 1);
});

test("managed uploads cannot be reused by a different message operation", async () => {
  const db = backend(); const id = await db.upload();
  await assert.rejects(db.createMessage(config, "different-message", message(id), []), { statusCode: 409 });
  assert.equal(db.rows.size, 1);
});

test("legacy IDs are never garbage-collected and managed sends fail closed without configuration", async () => {
  const db = backend(); const id = await db.upload();
  await assert.rejects(db.reconcile(config, "owner", "thread", "legacy-file"), { statusCode: 400 });
  await assert.rejects(db.createMessage({ ...config, attachmentOperationsTableId: null }, "message", message(id), []), { statusCode: 503 });
  assert.ok(db.files.has(id));
});

test("a conflict on the message ID rolls back its new file decision", async () => {
  const db = backend(); const id = await db.upload();
  db.rows.set(rowPath("messages", "message"), { text: "original" });
  await assert.rejects(db.createMessage(config, "message", message(id), []), { statusCode: 409 });
  assert.equal(db.rows.has(rowPath("uploads", `d_${id.slice(2)}`)), false);
  assert.equal((await db.reconcile(config, "owner", "thread", id)).status, "discarded");
});

test("a reserved identifier with unexpected storage ownership is never deleted", async () => {
  const db = backend(); const id = await db.upload();
  db.files.set(id, { $permissions: ['read("user:owner")'] });
  await assert.rejects(db.reconcile(config, "owner", "thread", id), { statusCode: 403 });
  assert.ok(db.files.has(id));
});

function profileBackend() {
  const db = backend();
  const profile = attachmentOperations(db.request, { profile: true });
  const settings = { ...config, avatarsBucketId: "avatars" };
  const reserve = async () => {
    const { fileId } = await profile.reserve(settings, "owner", "profile", "owner");
    db.files.set(fileId, { $permissions: ['update("user:owner")', 'delete("user:owner")'] });
    return fileId;
  };
  const save = fileIds => profile.commitProfile(settings, "owner", fileIds, transactionId =>
    db.request(settings, "POST", "/tablesdb/db/tables/profiles/rows", {
      rowId: "owner", data: { avatarFileId: fileIds[0], photoFileIds: fileIds }, transactionId
    }));
  return { db, profile, settings, reserve, save };
}

test("profile and all new photo references commit atomically", async () => {
  const { db, profile, settings, reserve, save } = profileBackend();
  const ids = [await reserve(), await reserve()];
  assert.ok(ids.every(id => /^p_[a-f0-9]{32}$/.test(id)));
  await save(ids);
  assert.deepEqual(db.rows.get(rowPath("profiles", "owner")).photoFileIds, ids);
  for (const id of ids) {
    assert.equal((await profile.reconcile(settings, "owner", "profile", id)).status, "referenced");
    assert.ok(db.files.has(id));
  }
});

test("cleanup during profile commit cannot leave a profile pointing at deleted photos", async () => {
  const { db, profile, settings, reserve, save } = profileBackend();
  const ids = [await reserve(), await reserve()];
  db.setBeforeCommit(() => profile.reconcile(settings, "owner", "profile", ids[1]));
  await assert.rejects(save(ids), { statusCode: 409 });
  assert.equal(db.rows.has(rowPath("profiles", "owner")), false);
  assert.equal((await profile.reconcile(settings, "owner", "profile", ids[0])).status, "discarded");
});

test("lost profile commit response retains saved photos", async () => {
  const { db, profile, settings, reserve, save } = profileBackend();
  const id = await reserve(); db.loseCommit();
  await assert.rejects(save([id]), { statusCode: 504 });
  assert.equal((await profile.reconcile(settings, "owner", "profile", id)).status, "referenced");
  assert.ok(db.files.has(id));
});

test("foreign owner and legacy profile IDs cannot be garbage-collected", async () => {
  const { profile, settings, reserve } = profileBackend();
  const id = await reserve();
  await assert.rejects(profile.reconcile(settings, "other", "profile", id), { statusCode: 403 });
  await assert.rejects(profile.reconcile(settings, "owner", "profile", "legacy"), { statusCode: 400 });
});

test("already committed profile files can be reused without another decision", async () => {
  const { db, profile, settings, reserve, save } = profileBackend();
  const id = await reserve(); await save([id]);
  let called = false;
  await profile.commitProfile(settings, "owner", [id], async transactionId => { called = true; assert.equal(transactionId, undefined); });
  assert.ok(called);
  assert.equal(db.calls.filter(c => c.path === "/tablesdb/transactions").length, 1);
});
