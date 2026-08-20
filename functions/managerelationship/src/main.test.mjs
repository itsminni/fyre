import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import handler, {
  canonicalParticipantUserIds,
  matchRowBelongsToThread,
  relationshipRowBelongsToThread,
  sharedRelationshipPermissions,
  stableParticipantRowId
} from "./main.js";

const ENVIRONMENT = {
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "database",
  APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
  APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships",
  APPWRITE_MATCHES_TABLE_ID: "matches"
};

test("relationship ACL remains read-only for both users", () => {
  assert.deepEqual(sharedRelationshipPermissions(["user-a", "user-b"]), [
    'read("user:user-a")',
    'read("user:user-b")'
  ]);
});

test("exactly two canonical, distinct participants including the caller are required", () => {
  const threadId = "thread-1";
  const validRows = ["user-a", "user-b"].map((userId) => ({
    $id: stableParticipantRowId(threadId, userId),
    threadId,
    userId
  }));

  assert.deepEqual(canonicalParticipantUserIds(validRows, threadId, "user-a"), ["user-a", "user-b"]);
  assert.equal(canonicalParticipantUserIds(validRows.slice(0, 1), threadId, "user-a"), null);
  assert.equal(canonicalParticipantUserIds([
    validRows[0],
    { ...validRows[1], $id: "forged-id" }
  ], threadId, "user-a"), null);
  assert.equal(canonicalParticipantUserIds([
    validRows[0],
    { ...validRows[0] }
  ], threadId, "user-a"), null);
  assert.equal(canonicalParticipantUserIds(validRows, threadId, "attacker"), null);
  assert.equal(canonicalParticipantUserIds([
    validRows[0],
    {
      $id: stableParticipantRowId(threadId, "../victim"),
      threadId,
      userId: "../victim"
    }
  ], threadId, "user-a"), null);
  assert.equal(canonicalParticipantUserIds([
    ...validRows,
    {
      $id: stableParticipantRowId(threadId, "attacker"),
      threadId,
      userId: "attacker"
    }
  ], threadId, "user-a"), null);
});

test("relationship and match rows must describe the verified pair and thread", () => {
  const users = ["user-a", "user-b"];
  assert.equal(relationshipRowBelongsToThread({
    pairKey: "user-a:user-b",
    userAId: "user-a",
    userBId: "user-b",
    threadId: "thread-1"
  }, users, "thread-1"), true);
  assert.equal(relationshipRowBelongsToThread({
    pairKey: "user-a:user-b",
    userAId: "user-a",
    userBId: "victim",
    threadId: "thread-1"
  }, users, "thread-1"), false);
  assert.equal(matchRowBelongsToThread({
    $id: "match-1",
    matchKey: "user-a:user-b",
    userAId: "user-a",
    userBId: "user-b",
    threadId: "victim-thread"
  }, users, "thread-1"), false);
});

test("blocking patches only the caller state and cannot overwrite the peer state", async () => {
  await withEnvironment(async () => {
    const threadId = "thread-1";
    const userIds = ["user-a", "user-b"];
    const relationshipId = stableRowId("rl", userIds.join(":"));
    const matchId = stableRowId("mt", userIds.join(":"));
    let relationshipPatch = null;
    let matchDelete = null;
    let committed = false;
    const transactionalReads = [];
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") {
        return response(200, { $id: "user-a" });
      }
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        return response(201, { $id: "tx-block" });
      }
      if (request.path === "/v1/tablesdb/transactions/tx-block" && request.method === "PATCH") {
        if (request.body.commit) committed = true;
        return response(200, {});
      }
      if (request.method === "GET" && request.path.endsWith("/tables/participants/rows")) {
        transactionalReads.push(request);
        return response(200, { rows: userIds.map((userId) => ({
          $id: stableParticipantRowId(threadId, userId),
          threadId,
          userId
        })) });
      }
      if (request.method === "GET" && request.path.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        transactionalReads.push(request);
        return response(200, {
          $id: relationshipId,
          pairKey: "user-a:user-b",
          userAId: "user-a",
          userBId: "user-b",
          userAState: "matched",
          userBState: "blocked",
          threadId,
          matchedAt: "2026-07-20T10:00:00.000Z",
          createdAt: "2026-07-20T10:00:00.000Z"
        });
      }
      if (request.method === "GET" && request.path.endsWith(`/tables/matches/rows/${matchId}`)) {
        transactionalReads.push(request);
        return response(200, canonicalMatch(matchId, threadId));
      }
      if (request.method === "PATCH" && request.path.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        relationshipPatch = request.body;
        return response(200, { $id: relationshipId });
      }
      if (request.method === "DELETE" && request.path.endsWith(`/tables/matches/rows/${matchId}`)) {
        matchDelete = request.body;
        return response(204);
      }
      return unexpected(request);
    };

    const result = await invoke({ threadId, action: "block" });
    assert.equal(result.status, 200);
    assert.equal(committed, true);
    assert.equal(relationshipPatch.data.userAState, "blocked");
    assert.equal(relationshipPatch.data.threadId, threadId);
    assert.equal(Object.hasOwn(relationshipPatch.data, "userBState"), false);
    assert.equal(relationshipPatch.transactionId, "tx-block");
    assert.deepEqual(matchDelete, { transactionId: "tx-block" });
    assert.deepEqual(relationshipPatch.permissions.sort(), [
      'read("user:user-a")',
      'read("user:user-b")'
    ]);
    assert.equal(transactionalReads.length, 3);
    assert.ok(transactionalReads.every((request) => request.url.searchParams.get("transactionId") === "tx-block"));
    assert.equal(transactionalReads[0].url.searchParams.get("ttl"), "0");
  });
});

test("a blocked peer cannot delete the blocker relationship with unmatch", async () => {
  await withEnvironment(async () => {
    const threadId = "thread-1";
    const userIds = ["user-a", "user-b"];
    const relationshipId = stableRowId("rl", userIds.join(":"));
    const matchId = stableRowId("mt", userIds.join(":"));
    let domainMutationCount = 0;
    let rolledBack = false;
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") {
        return response(200, { $id: "user-b" });
      }
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        return response(201, { $id: "tx-forbidden" });
      }
      if (request.path === "/v1/tablesdb/transactions/tx-forbidden" && request.method === "PATCH") {
        if (request.body.rollback) rolledBack = true;
        return response(200, {});
      }
      if (request.method === "GET" && request.path.endsWith("/tables/participants/rows")) {
        return response(200, { rows: userIds.map((userId) => ({
          $id: stableParticipantRowId(threadId, userId),
          threadId,
          userId
        })) });
      }
      if (request.method === "GET" && request.path.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        return response(200, {
          $id: relationshipId,
          pairKey: "user-a:user-b",
          userAId: "user-a",
          userBId: "user-b",
          userAState: "blocked",
          userBState: "matched",
          threadId
        });
      }
      if (request.method === "GET" && request.path.endsWith(`/tables/matches/rows/${matchId}`)) {
        return response(404, { message: "not found" });
      }
      if (request.path.includes("/tables/") && ["POST", "PATCH", "DELETE"].includes(request.method)) {
        domainMutationCount += 1;
      }
      return unexpected(request);
    };

    const result = await invoke({ threadId, action: "unmatch" });
    assert.equal(result.status, 403);
    assert.equal(domainMutationCount, 0);
    assert.equal(rolledBack, true);
  });
});

test("unmatch stages relationship and match deletion in one transaction", async () => {
  await withEnvironment(async () => {
    const threadId = "thread-1";
    const userIds = ["user-a", "user-b"];
    const relationshipId = stableRowId("rl", userIds.join(":"));
    const matchId = stableRowId("mt", userIds.join(":"));
    const operations = [];

    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") return response(200, { $id: "user-a" });
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        return response(201, { $id: "tx-unmatch" });
      }
      if (request.method === "GET" && request.path.endsWith("/tables/participants/rows")) {
        return response(200, { rows: userIds.map((userId) => ({
          $id: stableParticipantRowId(threadId, userId), threadId, userId
        })) });
      }
      if (request.method === "GET" && request.path.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        return response(200, canonicalRelationship(relationshipId, threadId));
      }
      if (request.method === "GET" && request.path.endsWith(`/tables/matches/rows/${matchId}`)) {
        return response(200, canonicalMatch(matchId, threadId));
      }
      if (request.method === "DELETE" && request.path.includes("/tables/")) {
        operations.push({ kind: "delete", path: request.path, body: request.body });
        return response(204);
      }
      if (request.path === "/v1/tablesdb/transactions/tx-unmatch" && request.method === "PATCH") {
        operations.push({ kind: request.body.commit ? "commit" : "rollback" });
        return response(200, {});
      }
      return unexpected(request);
    };

    const result = await invoke({ threadId, action: "unmatch" });

    assert.deepEqual(result, {
      payload: { ok: true, relationshipState: "none" },
      status: 200
    });
    assert.deepEqual(operations.map((operation) => operation.kind), ["delete", "delete", "commit"]);
    assert.deepEqual(operations.slice(0, 2).map((operation) => operation.body), [
      { transactionId: "tx-unmatch" },
      { transactionId: "tx-unmatch" }
    ]);
  });
});

test("unmatch retries a commit conflict and cannot erase a concurrent peer block", async () => {
  await withEnvironment(async () => {
    const threadId = "thread-1";
    const userIds = ["user-a", "user-b"];
    const relationshipId = stableRowId("rl", userIds.join(":"));
    const matchId = stableRowId("mt", userIds.join(":"));
    let transactionAttempt = 0;
    let participantReadCount = 0;
    let relationshipReadCount = 0;
    const stagedDeletes = [];
    const rollbacks = [];

    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") return response(200, { $id: "user-b" });
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        transactionAttempt += 1;
        return response(201, { $id: `tx-race-${transactionAttempt}` });
      }
      if (request.method === "GET" && request.path.endsWith("/tables/participants/rows")) {
        participantReadCount += 1;
        assert.equal(request.url.searchParams.get("transactionId"), `tx-race-${transactionAttempt}`);
        return response(200, { rows: userIds.map((userId) => ({
          $id: stableParticipantRowId(threadId, userId), threadId, userId
        })) });
      }
      if (request.method === "GET" && request.path.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        relationshipReadCount += 1;
        assert.equal(request.url.searchParams.get("transactionId"), `tx-race-${transactionAttempt}`);
        return response(200, {
          ...canonicalRelationship(relationshipId, threadId),
          userAState: transactionAttempt === 1 ? "matched" : "blocked"
        });
      }
      if (request.method === "GET" && request.path.endsWith(`/tables/matches/rows/${matchId}`)) {
        return response(200, canonicalMatch(matchId, threadId));
      }
      if (request.method === "DELETE" && request.path.includes("/tables/")) {
        stagedDeletes.push({ transactionAttempt, body: request.body });
        return response(204);
      }
      if (request.path === `/v1/tablesdb/transactions/tx-race-${transactionAttempt}` && request.method === "PATCH") {
        if (request.body.commit && transactionAttempt === 1) {
          return response(409, {
            message: "Transaction conflict",
            type: "database_transaction_conflict"
          });
        }
        if (request.body.rollback) rollbacks.push(transactionAttempt);
        return response(200, {});
      }
      return unexpected(request);
    };

    const result = await invoke({ threadId, action: "unmatch" });

    assert.equal(result.status, 403);
    assert.deepEqual(result.payload, { message: "Forbidden" });
    assert.equal(transactionAttempt, 2);
    assert.equal(participantReadCount, 2);
    assert.equal(relationshipReadCount, 2);
    assert.deepEqual(stagedDeletes, [
      { transactionAttempt: 1, body: { transactionId: "tx-race-1" } },
      { transactionAttempt: 1, body: { transactionId: "tx-race-1" } }
    ]);
    assert.deepEqual(rollbacks, [1, 2]);
  });
});

test("a forged participant row cannot authorize a relationship mutation", async () => {
  await withEnvironment(async () => {
    const threadId = "thread-1";
    const requests = [];
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      requests.push(request);

      if (request.path === "/v1/account") {
        return response(200, { $id: "user-a" });
      }
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        return response(201, { $id: "tx-forged" });
      }
      if (request.path === "/v1/tablesdb/transactions/tx-forged" && request.method === "PATCH") {
        return response(200, {});
      }
      if (request.method === "GET" && request.path.endsWith("/tables/participants/rows")) {
        return response(200, {
          rows: [
            {
              $id: stableParticipantRowId(threadId, "user-a"),
              threadId,
              userId: "user-a"
            },
            {
              $id: stableParticipantRowId(threadId, "victim"),
              threadId,
              userId: "attacker"
            }
          ]
        });
      }
      return unexpected(request);
    };

    const result = await invoke({
      currentUserId: "user-a",
      threadId,
      action: "block"
    });

    assert.equal(result.status, 403);
    assert.deepEqual(result.payload, { message: "Forbidden" });
    assert.equal(requests.some((request) => (
      request.path.includes("/tables/")
      && ["POST", "PATCH", "DELETE"].includes(request.method)
    )), false);
  });
});

async function withEnvironment(callback) {
  const keys = Object.keys(ENVIRONMENT);
  const originalEnvironment = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, ENVIRONMENT);
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function invoke(body) {
  return handler({
    req: {
      bodyJson: body,
      headers: {
        "x-appwrite-key": "server-key",
        "x-appwrite-user-jwt": "jwt"
      }
    },
    res: {
      json(payload, status) {
        return { payload, status };
      }
    },
    error() {}
  });
}

function response(status, payload = null) {
  return new Response(payload == null ? null : JSON.stringify(payload), {
    status,
    headers: payload == null ? undefined : { "Content-Type": "application/json" }
  });
}

function parseRequest(input, options = {}) {
  const url = new URL(String(input));
  return {
    url,
    path: url.pathname,
    method: options.method ?? "GET",
    body: options.body ? JSON.parse(options.body) : {}
  };
}

function unexpected(request) {
  return response(500, { message: `Unexpected ${request.method} ${request.path}` });
}

function stableRowId(prefix, seed) {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

function canonicalRelationship(relationshipId, threadId) {
  return {
    $id: relationshipId,
    pairKey: "user-a:user-b",
    userAId: "user-a",
    userBId: "user-b",
    userAState: "matched",
    userBState: "matched",
    threadId,
    matchedAt: "2026-07-20T10:00:00.000Z",
    createdAt: "2026-07-20T10:00:00.000Z"
  };
}

function canonicalMatch(matchId, threadId) {
  return {
    $id: matchId,
    matchKey: "user-a:user-b",
    userAId: "user-a",
    userBId: "user-b",
    threadId
  };
}
