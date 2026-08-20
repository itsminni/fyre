import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import handler, {
  isCanonicalMatchRow,
  isCanonicalSwipeRow,
  isCanonicalTargetProfile,
  participantRowsBelongToPair,
  participantRowPermissions,
  relationshipRowBelongsToPair,
  sharedRelationshipPermissions,
  swipePermissions
} from "./main.js";

const ENV = {
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "database",
  APPWRITE_PROFILES_TABLE_ID: "profiles",
  APPWRITE_SWIPES_TABLE_ID: "swipes",
  APPWRITE_MATCHES_TABLE_ID: "matches",
  APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships",
  APPWRITE_THREADS_TABLE_ID: "threads",
  APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants"
};

test("only canonical, ready profiles are eligible swipe participants", () => {
  assert.equal(isCanonicalTargetProfile(canonicalProfile("user-a"), "user-a"), true);
  assert.equal(isCanonicalTargetProfile({ ...canonicalProfile("user-a"), profileReady: false }, "user-a"), false);
  assert.equal(isCanonicalTargetProfile({ ...canonicalProfile("user-a"), userId: "user-b" }, "user-a"), false);
});

test("canonical swipe validation rejects forged reverse likes", () => {
  assert.equal(isCanonicalSwipeRow({
    swipeKey: "peer:current",
    fromUserId: "peer",
    toUserId: "current",
    decision: "liked"
  }, "peer", "current", "liked"), true);

  assert.equal(isCanonicalSwipeRow({
    swipeKey: "peer:current",
    fromUserId: "current",
    toUserId: "peer",
    decision: "liked"
  }, "peer", "current", "liked"), false);
  assert.equal(isCanonicalSwipeRow({
    swipeKey: "current:peer",
    fromUserId: "peer",
    toUserId: "current",
    decision: "liked"
  }, "peer", "current", "liked"), false);
  assert.equal(isCanonicalSwipeRow({
    swipeKey: "current:peer",
    fromUserId: "current",
    toUserId: "peer",
    decision: "passed"
  }, "current", "peer"), true);
  assert.equal(isCanonicalSwipeRow({
    swipeKey: "peer:current",
    fromUserId: "peer",
    toUserId: "current",
    decision: "liked"
  }, "peer", "current", "liked", true), false);
  assert.equal(isCanonicalSwipeRow({
    swipeKey: "peer:current",
    fromUserId: "peer",
    toUserId: "current",
    decision: "liked",
    serverRecordedAt: "2026-07-21T10:00:00.000Z"
  }, "peer", "current", "liked", true), true);
});

test("match and participant topology must belong to the exact pair", () => {
  const userIds = ["current", "peer"];
  const canonicalThreadId = stableId("th", "current:peer");
  assert.equal(isCanonicalMatchRow({
    matchKey: "current:peer",
    userAId: "current",
    userBId: "peer",
    threadId: canonicalThreadId
  }, userIds), true);
  assert.equal(isCanonicalMatchRow({
    matchKey: "current:peer",
    userAId: "current",
    userBId: "victim",
    threadId: canonicalThreadId
  }, userIds), false);
  assert.equal(isCanonicalMatchRow({
    matchKey: "current:peer",
    userAId: "current",
    userBId: "peer",
    threadId: "noncanonical-thread"
  }, userIds), false);
  assert.equal(relationshipRowBelongsToPair({
    pairKey: "current:peer",
    userAId: "current",
    userBId: "peer"
  }, userIds), true);
  assert.equal(relationshipRowBelongsToPair({
    pairKey: "current:peer",
    userAId: "current",
    userBId: "peer",
    threadId: canonicalThreadId
  }, userIds), true);
  assert.equal(relationshipRowBelongsToPair({
    pairKey: "current:peer",
    userAId: "current",
    userBId: "victim"
  }, userIds), false);
  assert.equal(relationshipRowBelongsToPair({
    pairKey: "current:peer",
    userAId: "current",
    userBId: "peer",
    threadId: "noncanonical-thread"
  }, userIds), false);

  const participantId = (threadId, userId) => `tp_${createHash("sha256")
    .update(`${threadId}:${userId}`).digest("hex").slice(0, 32)}`;
  assert.equal(participantRowsBelongToPair([
    { $id: participantId("thread", "current"), threadId: "thread", userId: "current" },
    { $id: participantId("thread", "peer"), threadId: "thread", userId: "peer" }
  ], "thread", ["current", "peer"]), true);
  assert.equal(participantRowsBelongToPair([
    { $id: participantId("thread", "current"), threadId: "thread", userId: "current" },
    { $id: participantId("thread", "victim"), threadId: "thread", userId: "victim" }
  ], "thread", ["current", "peer"]), false);
});

test("swipe, match, thread, relationship, and participant ACLs are read-only", () => {
  assert.deepEqual(swipePermissions("current"), ['read("user:current")']);
  assert.deepEqual(sharedRelationshipPermissions(["current", "peer"]), [
    'read("user:current")',
    'read("user:peer")'
  ]);
  assert.deepEqual(participantRowPermissions(["current", "peer"]), [
    'read("user:current")',
    'read("user:peer")'
  ]);
});

test("a missing canonical target profile is rejected before any row write", async () => {
  await withEnvironment(async () => {
    const backend = transactionalBackend({
      currentUserId: "user-a",
      tables: { profiles: [canonicalProfile("user-a")] }
    });
    globalThis.fetch = backend.fetch;

    const result = await invoke({
      currentUserId: "user-a",
      otherUserId: "user-b",
      decision: "liked"
    });

    assert.equal(result.status, 404);
    assert.deepEqual(result.payload, { message: "Interaction unavailable" });
    assert.equal(backend.rowMutations().length, 0);
    assert.equal(backend.commitAttempts, 0);
  });
});

test("a relationship with a noncanonical thread id is rejected before any row write", async () => {
  await withEnvironment(async () => {
    const pairKey = "user-a:user-b";
    const backend = transactionalBackend({
      currentUserId: "user-a",
      tables: {
        profiles: [canonicalProfile("user-a"), canonicalProfile("user-b")],
        relationships: [{
          $id: stableId("rl", pairKey),
          pairKey,
          userAId: "user-a",
          userBId: "user-b",
          userAState: "matched",
          userBState: "matched",
          threadId: "noncanonical-thread"
        }]
      }
    });
    globalThis.fetch = backend.fetch;

    const result = await invoke({
      currentUserId: "user-a",
      otherUserId: "user-b",
      decision: "liked"
    });

    assert.equal(result.status, 409);
    assert.equal(backend.rowMutations().length, 0);
    assert.equal(backend.commitAttempts, 0);
  });
});

test("mutual likes commit both relationship states, thread, and match atomically", async () => {
  await withEnvironment(async () => {
    const now = "2026-07-21T10:00:00.000Z";
    const backend = transactionalBackend({
      currentUserId: "user-a",
      tables: {
        profiles: [canonicalProfile("user-a"), canonicalProfile("user-b")],
        swipes: [canonicalSwipe("user-b", "user-a", "liked", now)]
      }
    });
    globalThis.fetch = backend.fetch;

    const result = await invoke({
      currentUserId: "user-a",
      otherUserId: "user-b",
      decision: "liked"
    });

    assert.equal(result.status, 200);
    assert.equal(result.payload.matched, true);
    const relationship = backend.row("relationships", stableId("rl", "user-a:user-b"));
    assert.equal(relationship.userAState, "matched");
    assert.equal(relationship.userBState, "matched");
    assert.equal(relationship.threadId, result.payload.threadId);
    assert.ok(backend.row("matches", stableId("mt", "user-a:user-b")));
    assert.equal(backend.rows("participants").length, 2);
    assert.equal(backend.commitAttempts, 1);
    assert.ok(backend.rowMutations().every((request) => request.body.transactionId));
  });
});

test("a concurrent reverse pass conflicts, retries, and atomically revokes a stale match", async () => {
  await withEnvironment(async () => {
    const now = "2026-07-21T10:00:00.000Z";
    const pairKey = "user-a:user-b";
    const threadId = stableId("th", pairKey);
    const relationshipId = stableId("rl", pairKey);
    const matchId = stableId("mt", pairKey);
    const reverseSwipeId = stableId("sw", "user-b:user-a");
    const backend = transactionalBackend({
      currentUserId: "user-a",
      conflictOnce({ tables }) {
        const reverse = tables.swipes.get(reverseSwipeId);
        tables.swipes.set(reverseSwipeId, {
          ...reverse,
          decision: "passed",
          serverRecordedAt: "2026-07-21T10:01:00.000Z"
        });
      },
      tables: {
        profiles: [canonicalProfile("user-a"), canonicalProfile("user-b")],
        swipes: [
          canonicalSwipe("user-a", "user-b", "liked", now),
          canonicalSwipe("user-b", "user-a", "liked", now)
        ],
        relationships: [{
          $id: relationshipId,
          pairKey,
          userAId: "user-a",
          userBId: "user-b",
          userAState: "matched",
          userBState: "matched",
          threadId,
          matchedAt: now,
          createdAt: now,
          updatedAt: now
        }],
        matches: [{
          $id: matchId,
          matchKey: pairKey,
          userAId: "user-a",
          userBId: "user-b",
          threadId,
          createdAt: now,
          matchedAt: now
        }],
        threads: [{
          $id: threadId,
          threadId,
          createdByUserId: "user-a",
          subject: "Match",
          status: "active"
        }],
        participants: ["user-a", "user-b"].map((userId) => ({
          $id: stableId("tp", `${threadId}:${userId}`),
          threadId,
          userId,
          role: "participant"
        }))
      }
    });
    globalThis.fetch = backend.fetch;

    const result = await invoke({
      currentUserId: "user-a",
      otherUserId: "user-b",
      decision: "liked"
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.payload, { matched: false, relationshipState: "liked" });
    assert.equal(backend.commitAttempts, 2);
    assert.equal(backend.row("matches", matchId), null);
    const relationship = backend.row("relationships", relationshipId);
    assert.equal(relationship.userAState, "liked");
    assert.equal(relationship.userBState, "none");
    assert.equal(relationship.threadId, null);
    assert.equal(relationship.matchedAt, null);
    const finalTransactionId = backend.successfulTransactionId;
    const finalMutations = backend.rowMutations().filter((request) => (
      request.body.transactionId === finalTransactionId
    ));
    assert.ok(finalMutations.some((request) => (
      request.method === "DELETE" && request.path.endsWith(`/tables/matches/rows/${matchId}`)
    )));
    assert.ok(finalMutations.every((request) => request.body.transactionId === finalTransactionId));
  });
});

function canonicalProfile(userId) {
  return { $id: userId, userId, profileReady: true };
}

function canonicalSwipe(fromUserId, toUserId, decision, recordedAt) {
  const swipeKey = `${fromUserId}:${toUserId}`;
  return {
    $id: stableId("sw", swipeKey),
    swipeKey,
    fromUserId,
    toUserId,
    decision,
    createdAt: recordedAt,
    serverRecordedAt: recordedAt
  };
}

function stableId(prefix, seed) {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

function transactionalBackend(options = {}) {
  const tableNames = [
    "profiles",
    "swipes",
    "matches",
    "threads",
    "participants",
    "relationships"
  ];
  let tables = Object.fromEntries(tableNames.map((tableName) => [tableName, new Map()]));
  for (const [tableName, rows] of Object.entries(options.tables ?? {})) {
    for (const row of rows) {
      tables[tableName].set(row.$id, structuredClone(row));
    }
  }

  const transactions = new Map();
  const requests = [];
  let transactionSequence = 0;
  let commitAttempts = 0;
  let successfulTransactionId = null;

  const cloneTables = (source) => Object.fromEntries(
    tableNames.map((tableName) => [
      tableName,
      new Map([...source[tableName]].map(([rowId, row]) => [rowId, structuredClone(row)]))
    ])
  );

  const fetch = async (input, requestOptions = {}) => {
    const url = new URL(String(input));
    const method = requestOptions.method ?? "GET";
    const body = requestOptions.body ? JSON.parse(requestOptions.body) : null;
    const request = {
      method,
      path: url.pathname,
      body,
      queries: url.searchParams.getAll("queries[]")
    };
    requests.push(request);

    if (url.pathname === "/v1/account") {
      return response(200, { $id: options.currentUserId ?? "user-a" });
    }

    if (method === "POST" && url.pathname === "/v1/tablesdb/transactions") {
      transactionSequence += 1;
      const transactionId = `tx-${transactionSequence}`;
      transactions.set(transactionId, cloneTables(tables));
      return response(201, { $id: transactionId });
    }

    const transactionMatch = url.pathname.match(/^\/v1\/tablesdb\/transactions\/([^/]+)$/);
    if (method === "PATCH" && transactionMatch) {
      const transactionId = decodeURIComponent(transactionMatch[1]);
      if (body?.rollback === true) {
        transactions.delete(transactionId);
        return response(200, { $id: transactionId });
      }
      if (body?.commit !== true || !transactions.has(transactionId)) {
        return response(404, { message: "Transaction not found" });
      }

      commitAttempts += 1;
      if (commitAttempts === 1 && typeof options.conflictOnce === "function") {
        options.conflictOnce({ tables });
        return response(409, {
          type: "transaction_conflict",
          message: "Concurrent row change"
        });
      }

      tables = cloneTables(transactions.get(transactionId));
      transactions.delete(transactionId);
      successfulTransactionId = transactionId;
      return response(200, { $id: transactionId });
    }

    const rowMatch = url.pathname.match(
      /^\/v1\/tablesdb\/database\/tables\/([^/]+)\/rows(?:\/([^/]+))?$/
    );
    if (!rowMatch) {
      return response(500, { message: `Unexpected ${method} ${url.pathname}` });
    }

    const tableName = decodeURIComponent(rowMatch[1]);
    const rowId = rowMatch[2] ? decodeURIComponent(rowMatch[2]) : null;
    const transactionId = body?.transactionId ?? url.searchParams.get("transactionId");
    const selectedTables = transactionId ? transactions.get(transactionId) : tables;
    if (!selectedTables?.[tableName]) {
      return response(404, { message: "Table or transaction not found" });
    }
    const table = selectedTables[tableName];

    if (method === "GET" && rowId) {
      const row = table.get(rowId);
      return row
        ? response(200, structuredClone(row))
        : response(404, { type: "row_not_found", message: "Not found" });
    }

    if (method === "GET" && !rowId) {
      let rows = [...table.values()].map((row) => structuredClone(row));
      for (const serializedQuery of request.queries) {
        const query = JSON.parse(serializedQuery);
        if (query.method === "equal") {
          rows = rows.filter((row) => query.values.includes(row[query.attribute]));
        }
        if (query.method === "limit") {
          rows = rows.slice(0, query.values[0]);
        }
      }
      return response(200, { rows });
    }

    if (!transactionId || !transactions.has(transactionId)) {
      return response(400, { message: "Row writes must be transactional" });
    }

    if (method === "POST" && !rowId) {
      if (table.has(body.rowId)) {
        return response(409, { message: "Row already exists" });
      }
      const row = {
        $id: body.rowId,
        ...body.data,
        $permissions: body.permissions ?? []
      };
      table.set(body.rowId, row);
      return response(201, structuredClone(row));
    }

    if (method === "PATCH" && rowId) {
      const existing = table.get(rowId);
      if (!existing) {
        return response(404, { message: "Row not found" });
      }
      const row = {
        ...existing,
        ...body.data,
        ...(body.permissions ? { $permissions: body.permissions } : {})
      };
      table.set(rowId, row);
      return response(200, structuredClone(row));
    }

    if (method === "DELETE" && rowId) {
      if (!table.has(rowId)) {
        return response(404, { message: "Row not found" });
      }
      table.delete(rowId);
      return response(204, {});
    }

    return response(500, { message: `Unexpected ${method} ${url.pathname}` });
  };

  return {
    fetch,
    row(tableName, rowId) {
      const value = tables[tableName].get(rowId);
      return value ? structuredClone(value) : null;
    },
    rows(tableName) {
      return [...tables[tableName].values()].map((row) => structuredClone(row));
    },
    rowMutations() {
      return requests.filter((request) => (
        request.path.includes("/tables/")
        && ["POST", "PATCH", "DELETE"].includes(request.method)
      ));
    },
    get commitAttempts() {
      return commitAttempts;
    },
    get successfulTransactionId() {
      return successfulTransactionId;
    }
  };
}

async function invoke(body) {
  let payload = null;
  let status = null;
  await handler({
    req: {
      bodyJson: body,
      headers: {
        "x-appwrite-key": "server-key",
        "x-appwrite-user-jwt": "valid-jwt",
        "x-appwrite-user-id": body.currentUserId ?? "current"
      }
    },
    res: {
      json(nextPayload, nextStatus = 200) {
        payload = nextPayload;
        status = nextStatus;
        return { payload, status };
      }
    },
    error() {}
  });
  return { payload, status };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

async function withEnvironment(run) {
  const originalFetch = globalThis.fetch;
  const snapshot = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));
  Object.assign(process.env, ENV);
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
