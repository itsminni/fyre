import test from "node:test";
import assert from "node:assert/strict";

import handler, {
  isCanonicalParticipantSet,
  isCanonicalRelationshipRow,
  participantRowPermissions,
  peerProjectionFromProfile,
  sharedConversationPermissions,
  stableParticipantRowId,
  stableRelationshipRowId,
  stableThreadRowId,
  threadPayloadFromExisting
} from "./main.js";

const ENVIRONMENT = {
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "database",
  APPWRITE_PROFILES_TABLE_ID: "profiles",
  APPWRITE_THREADS_TABLE_ID: "threads",
  APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
  APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships",
  APPWRITE_AVATARS_BUCKET_ID: "avatars",
  APPWRITE_AVATAR_TOKEN_TTL_SECONDS: "300"
};

test("thread and participant rows are read-only for both participants", () => {
  const expected = ['read("user:user-a")', 'read("user:user-b")'];
  assert.deepEqual(sharedConversationPermissions(["user-a", "user-b"]), expected);
  assert.deepEqual(participantRowPermissions(["user-a", "user-b"]), expected);
});

test("peer projection exposes only the approved fields and never email or location", () => {
  const projection = peerProjectionFromProfile({
    userId: "user-b",
    firstName: "  Bea  ",
    lastName: " Rossi ",
    email: "private@example.com",
    latitude: 44.1,
    longitude: 10.2,
    bio: "private bio",
    avatarFileId: "avatar-b",
    presenceUpdatedAt: "2030-01-02T03:04:05Z",
    lastSeenAt: "2030-01-02T03:00:00Z"
  }, "user-b");

  assert.deepEqual(projection, {
    userId: "user-b",
    displayName: "Bea Rossi",
    avatarUrl: null,
    presenceUpdatedAt: "2030-01-02T03:04:05.000Z",
    lastSeenAt: "2030-01-02T03:00:00.000Z"
  });
  assert.deepEqual(Object.keys(projection).sort(), [
    "avatarUrl",
    "displayName",
    "lastSeenAt",
    "presenceUpdatedAt",
    "userId"
  ]);
});

test("client supplied names cannot become the shared thread subject", () => {
  const payload = threadPayloadFromExisting({
    createdByUserId: "user-a",
    subject: "<script>spoofed peer</script>"
  }, "thread-id", "user-a", "Attacker controlled name");

  assert.equal(payload.subject, "Match");
});

test("relationship and participant validation rejects structural spoofing", () => {
  const userIds = ["user-a", "user-b"];
  const threadId = stableThreadRowId(userIds);
  const relationship = {
    $id: stableRelationshipRowId(userIds),
    pairKey: userIds.join(":"),
    userAId: userIds[0],
    userBId: userIds[1],
    threadId
  };
  assert.equal(isCanonicalRelationshipRow(relationship, userIds), true);
  assert.equal(isCanonicalRelationshipRow({ ...relationship, userBId: "attacker" }, userIds), false);
  assert.equal(isCanonicalRelationshipRow({ ...relationship, threadId: "noncanonical-thread" }, userIds), false);

  const participants = userIds.map((userId) => ({
    $id: stableParticipantRowId(threadId, userId),
    threadId,
    userId
  }));
  assert.equal(isCanonicalParticipantSet(participants, threadId, userIds), true);
  assert.equal(isCanonicalParticipantSet([
    ...participants,
    { $id: stableParticipantRowId(threadId, "attacker"), threadId, userId: "attacker" }
  ], threadId, userIds), false);
});

test("a canonical relationship reuses only the stable pair thread", async () => {
  await withEnvironment(async () => {
    const userIds = ["user-a", "user-b"];
    const relationshipId = stableRelationshipRowId(userIds);
    const threadId = stableThreadRowId(userIds);
    const participants = userIds.map((userId) => ({
      $id: stableParticipantRowId(threadId, userId),
      threadId,
      userId,
      role: "participant"
    }));
    const requests = [];

    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      const method = options.method ?? "GET";
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ method, path: url.pathname, body });

      if (url.pathname === "/v1/account") {
        return response(200, { $id: "user-a" });
      }
      if (method === "GET" && url.pathname.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        return response(200, {
          $id: relationshipId,
          pairKey: "user-a:user-b",
          userAId: "user-a",
          userBId: "user-b",
          userAState: "matched",
          userBState: "matched",
          threadId
        });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/participants/rows")) {
        return response(200, { rows: participants });
      }
      if (method === "GET" && url.pathname.endsWith(`/tables/threads/rows/${threadId}`)) {
        return response(200, {
          $id: threadId,
          threadId,
          createdByUserId: "user-a",
          subject: "Match",
          status: "active"
        });
      }
      if (method === "PATCH" && url.pathname.includes("/tables/threads/rows/")) {
        return response(200, { $id: threadId });
      }
      if (method === "GET" && url.pathname.includes("/tables/participants/rows/")) {
        const participant = participants.find((row) => url.pathname.endsWith(`/rows/${row.$id}`));
        return participant ? response(200, participant) : response(404, { message: "Not found" });
      }
      if (method === "PATCH" && url.pathname.includes("/tables/participants/rows/")) {
        return response(200, { $id: url.pathname.split("/").at(-1) });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-b")) {
        return response(200, { $id: "user-b", userId: "user-b", firstName: "Bea" });
      }
      return response(500, { message: `Unexpected ${method} ${url.pathname}` });
    };

    const result = await invoke({ currentUserId: "user-a", otherUserId: "user-b" });
    assert.equal(result.status, 200);
    assert.equal(result.payload.threadId, threadId);
    assert.equal(requests.some((request) => request.method === "POST"), false);
  });
});

test("a relationship with a noncanonical thread id is rejected before conversation access", async () => {
  await withEnvironment(async () => {
    const userIds = ["user-a", "user-b"];
    const relationshipId = stableRelationshipRowId(userIds);
    const threadId = "noncanonical-thread";
    const requests = [];

    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      const method = options.method ?? "GET";
      requests.push({ method, path: url.pathname });
      if (url.pathname === "/v1/account") return response(200, { $id: "user-a" });
      if (url.pathname.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        return response(200, {
          $id: relationshipId,
          pairKey: "user-a:user-b",
          userAId: "user-a",
          userBId: "user-b",
          userAState: "matched",
          userBState: "matched",
          threadId
        });
      }
      return response(500, { message: "Unexpected request" });
    };

    const result = await invoke({ currentUserId: "user-a", otherUserId: "user-b" });
    assert.equal(result.status, 403);
    assert.equal(requests.some((request) => request.path.includes("/tables/participants/")), false);
    assert.equal(requests.some((request) => ["POST", "PATCH", "DELETE"].includes(request.method)), false);
  });
});

test("authenticated peer projection returns minimal metadata without mutating conversation rows", async () => {
  await withEnvironment(async () => {
    const userIds = ["user-a", "user-b"];
    const threadId = stableThreadRowId(userIds);
    const relationshipId = stableRelationshipRowId(userIds);
    const participants = userIds.map((userId) => ({
      $id: stableParticipantRowId(threadId, userId),
      threadId,
      userId,
      role: "participant"
    }));
    const requests = [];
    const logs = [];
    console.log = (value) => logs.push(String(value));

    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      const method = options.method ?? "GET";
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ method, path: url.pathname, body });

      if (url.pathname === "/v1/account") {
        return response(200, { $id: "user-a", email: "caller@example.com" });
      }
      if (method === "GET" && url.pathname.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        return response(200, {
          $id: relationshipId,
          pairKey: "user-a:user-b",
          userAId: "user-a",
          userBId: "user-b",
          userAState: "matched",
          userBState: "matched",
          threadId,
          matchedAt: "2030-01-01T00:00:00Z"
        });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/participants/rows")) {
        return response(200, { rows: participants });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-b")) {
        return response(200, {
          $id: "user-b",
          userId: "user-b",
          firstName: "Bea",
          lastName: "Rossi",
          email: "must-not-leak@example.com",
          latitude: 44.1,
          longitude: 10.2,
          avatarFileId: "avatar-b",
          presenceUpdatedAt: "2030-01-02T03:04:05Z",
          lastSeenAt: "2030-01-02T03:00:00Z"
        });
      }
      if (method === "POST" && url.pathname.endsWith("/tokens/buckets/avatars/files/avatar-b")) {
        return response(201, {
          secret: "short-lived-avatar-secret",
          expire: "2099-01-01T00:00:00.000Z"
        });
      }
      return response(500, { message: `Unexpected ${method} ${url.pathname}` });
    };

    const result = await invoke({
      action: "peerProjection",
      currentUserId: "user-a",
      otherUserId: "user-b",
      otherUserName: "<script>attacker supplied</script>"
    });

    assert.equal(result.status, 200);
    assert.equal(result.payload.threadId, threadId);
    assert.deepEqual(result.payload.peer, {
      userId: "user-b",
      displayName: "Bea Rossi",
      avatarUrl: "https://appwrite.test/v1/storage/buckets/avatars/files/avatar-b/view?project=project&token=short-lived-avatar-secret",
      presenceUpdatedAt: "2030-01-02T03:04:05.000Z",
      lastSeenAt: "2030-01-02T03:00:00.000Z"
    });
    assert.equal(requests.filter((request) => request.method === "POST").length, 1);
    assert.equal(requests.some((request) => ["PATCH", "DELETE"].includes(request.method)), false);
    assert.equal(JSON.stringify(result.payload).includes("must-not-leak"), false);
    assert.equal(JSON.stringify(result.payload).includes("latitude"), false);
    assert.equal(logs.join("\n").includes("short-lived-avatar-secret"), false);

    const repeatedResult = await invoke({
      action: "peerProjection",
      currentUserId: "user-a",
      otherUserId: "user-b"
    });
    assert.equal(repeatedResult.payload.peer.avatarUrl, result.payload.peer.avatarUrl);
    assert.equal(requests.filter((request) => request.method === "POST").length, 1);
  });
});

test("a forged relationship is rejected before profile reads or conversation writes", async () => {
  await withEnvironment(async () => {
    const userIds = ["user-a", "user-b"];
    const relationshipId = stableRelationshipRowId(userIds);
    const requests = [];
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      const method = options.method ?? "GET";
      requests.push({ method, path: url.pathname });
      if (url.pathname === "/v1/account") {
        return response(200, { $id: "user-a" });
      }
      if (url.pathname.endsWith(`/tables/relationships/rows/${relationshipId}`)) {
        return response(200, {
          $id: relationshipId,
          pairKey: "user-a:user-b",
          userAId: "user-a",
          userBId: "attacker",
          userAState: "matched",
          userBState: "matched"
        });
      }
      return response(500, { message: "Unexpected request" });
    };

    const result = await invoke({ currentUserId: "user-a", otherUserId: "user-b" });
    assert.equal(result.status, 403);
    assert.equal(requests.some((request) => request.path.includes("/tables/profiles/")), false);
    assert.equal(requests.some((request) => request.path.includes("/tokens/")), false);
    assert.equal(requests.some((request) => ["POST", "PATCH", "DELETE"].includes(request.method)), false);
  });
});

async function withEnvironment(callback) {
  const keys = Object.keys(ENVIRONMENT);
  const originalEnvironment = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  );
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  Object.assign(process.env, ENVIRONMENT);
  console.log = () => undefined;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
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

function response(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
