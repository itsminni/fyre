import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import handler, {
  canonicalAttachmentMetadata,
  hasFileOwnership,
  isReplyInThread,
  relationshipAllowsMessaging,
  validateParticipantRows
} from "./main.js";

const ENV_KEYS = [
  "APPWRITE_FUNCTION_API_ENDPOINT",
  "APPWRITE_FUNCTION_PROJECT_ID",
  "APPWRITE_DATABASE_ID",
  "APPWRITE_THREADS_TABLE_ID",
  "APPWRITE_THREAD_PARTICIPANTS_TABLE_ID",
  "APPWRITE_MESSAGES_TABLE_ID",
  "APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID",
  "APPWRITE_RELATIONSHIPS_TABLE_ID"
];

test("sendmessage recreates a missing thread row from existing participant rows", async () => {
  const originalEnv = snapshotEnv();
  const originalFetch = globalThis.fetch;
  const originalConsoleLog = console.log;
  const requests = [];
  const logs = [];

  Object.assign(process.env, {
    APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
    APPWRITE_FUNCTION_PROJECT_ID: "project",
    APPWRITE_DATABASE_ID: "db",
    APPWRITE_THREADS_TABLE_ID: "threads",
    APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
    APPWRITE_MESSAGES_TABLE_ID: "messages",
    APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships"
  });
  console.log = (...values) => logs.push(values.join(" "));

  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/v1/account") {
      return jsonResponse(200, { $id: "user-a" });
    }
    const request = {
      method: options.method,
      path: parsed.pathname,
      body: options.body ? JSON.parse(options.body) : null
    };
    requests.push(request);

    if (request.method === "GET" && request.path.endsWith("/tables/participants/rows")) {
      return jsonResponse(200, {
        rows: [
          { $id: participantRowId("thread-1", "user-a"), threadId: "thread-1", userId: "user-a" },
          { $id: participantRowId("thread-1", "user-b"), threadId: "thread-1", userId: "user-b" }
        ]
      });
    }

    if (request.method === "GET" && request.path.includes("/tables/relationships/rows/")) {
      return jsonResponse(200, matchedRelationship("user-a", "user-b", "thread-1"));
    }

    if (request.method === "GET" && request.path.endsWith("/tables/threads/rows/thread-1")) {
      const threadPost = requests.find((item) => (
        item.method === "POST"
        && item.path.endsWith("/tables/threads/rows")
      ));
      if (!threadPost) {
        return jsonResponse(404, { message: "Row with the requested ID 'thread-1' could not be found." });
      }
      return jsonResponse(200, { $id: "thread-1", ...threadPost.body.data });
    }

    if (request.method === "POST" && request.path.endsWith("/tables/threads/rows")) {
      return jsonResponse(201, { $id: request.body.rowId, ...request.body.data });
    }

    if (request.method === "PATCH" && request.path.includes("/tables/participants/rows/")) {
      return jsonResponse(200, { $id: request.path.split("/").at(-1), ...request.body.data });
    }

    if (request.method === "POST" && request.path.endsWith("/tables/messages/rows")) {
      return jsonResponse(201, { $id: request.body.rowId, ...request.body.data });
    }

    if (request.method === "PATCH" && request.path.endsWith("/tables/threads/rows/thread-1")) {
      return jsonResponse(200, { $id: "thread-1", ...request.body.data });
    }

    return jsonResponse(500, { message: `Unexpected request ${request.method} ${request.path}` });
  };

  try {
    const response = await invokeHandler({
      threadId: "thread-1",
      text: "ciao",
      currentUserId: "user-a"
    });

    assert.equal(response.status, 200);
    assert.equal(response.payload.text, "ciao");

    const threadCreate = requests.find((request) => (
      request.method === "POST"
      && request.path.endsWith("/tables/threads/rows")
    ));
    assert.ok(threadCreate);
    assert.equal(threadCreate.body.rowId, "thread-1");
    assert.equal(threadCreate.body.data.subject, "Match");
    assert.deepEqual(threadCreate.body.permissions.sort(), [
      'read("user:user-a")',
      'read("user:user-b")'
    ]);
    const messageCreate = requests.find((request) => (
      request.method === "POST" && request.path.endsWith("/tables/messages/rows")
    ));
    assert.deepEqual(messageCreate.body.permissions.sort(), [
      'read("user:user-a")',
      'read("user:user-b")'
    ]);
    assert.equal(logs.some((entry) => entry.includes("ciao")), false);
  } finally {
    restoreEnv(originalEnv);
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
  }
});

test("participant rows must be canonical and unique", () => {
  const valid = [
    { $id: participantRowId("thread-1", "user-a"), threadId: "thread-1", userId: "user-a" },
    { $id: participantRowId("thread-1", "user-b"), threadId: "thread-1", userId: "user-b" }
  ];
  assert.deepEqual(validateParticipantRows("thread-1", valid)?.userIds, ["user-a", "user-b"]);
  assert.equal(validateParticipantRows("thread-1", [valid[0], { ...valid[1], userId: "user-a" }]), null);
  assert.equal(validateParticipantRows("thread-1", [valid[0], { ...valid[1], $id: "forged" }]), null);
});

test("attachment sharing rejects a file not owned by the authenticated sender", async () => {
  const originalEnv = snapshotEnv();
  const originalFetch = globalThis.fetch;
  const requests = [];
  Object.assign(process.env, {
    APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
    APPWRITE_FUNCTION_PROJECT_ID: "project",
    APPWRITE_DATABASE_ID: "db",
    APPWRITE_THREADS_TABLE_ID: "threads",
    APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
    APPWRITE_MESSAGES_TABLE_ID: "messages",
    APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID: "attachments",
    APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships"
  });

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, path: url.pathname, body });
    if (url.pathname === "/v1/account") {
      return jsonResponse(200, { $id: "user-a" });
    }
    if (method === "GET" && url.pathname.endsWith("/tables/participants/rows")) {
      return jsonResponse(200, { rows: participantRows("thread-1") });
    }
    if (method === "GET" && url.pathname.includes("/tables/relationships/rows/")) {
      return jsonResponse(200, matchedRelationship("user-a", "user-b", "thread-1"));
    }
    if (method === "GET" && url.pathname.endsWith("/tables/threads/rows/thread-1")) {
      return jsonResponse(200, { $id: "thread-1", status: "active" });
    }
    if (method === "PATCH" && url.pathname.includes("/tables/")) {
      return jsonResponse(200, { $id: url.pathname.split("/").at(-1), ...body.data });
    }
    if (method === "GET" && url.pathname.endsWith("/storage/buckets/attachments/files/file-b")) {
      return jsonResponse(200, {
        $id: "file-b",
        name: "private.jpg",
        $permissions: [
          'read("user:user-b")',
          'update("user:user-b")',
          'delete("user:user-b")'
        ]
      });
    }
    return jsonResponse(500, { message: `Unexpected ${method} ${url.pathname}` });
  };

  try {
    const result = await invokeHandler({
      threadId: "thread-1",
      attachmentFileId: "file-b",
      attachmentName: "private.jpg",
      currentUserId: "user-a"
    });
    assert.equal(result.status, 403);
    assert.equal(hasFileOwnership({
      $permissions: ['update("user:user-b")', 'delete("user:user-b")']
    }, "user-a"), false);
    assert.equal(requests.some((request) => request.method === "PUT"), false);
    assert.equal(requests.some((request) => (
      request.method === "POST" && request.path.endsWith("/tables/messages/rows")
    )), false);
  } finally {
    restoreEnv(originalEnv);
    globalThis.fetch = originalFetch;
  }
});

test("attachment metadata is derived from Appwrite and bounded", () => {
  assert.deepEqual(canonicalAttachmentMetadata({
    name: "folder/photo.JPG",
    mimeType: "image/jpeg",
    sizeOriginal: 1234
  }, {
    messageType: "file",
    attachmentName: "spoof.exe",
    attachmentMimeType: "application/x-msdownload",
    attachmentSize: 1,
    attachmentWidth: 640,
    attachmentHeight: 480
  }), {
    messageType: "image",
    attachmentName: "photo.JPG",
    attachmentMimeType: "image/jpeg",
    attachmentSize: 1234,
    attachmentWidth: 640,
    attachmentHeight: 480,
    attachmentDuration: null
  });

  assert.equal(canonicalAttachmentMetadata({
    name: "photo.jpg",
    mimeType: "application/pdf",
    sizeOriginal: 1234
  }, {}), null);
  assert.equal(canonicalAttachmentMetadata({
    name: "video.mp4",
    mimeType: "video/mp4",
    sizeOriginal: 20 * 1024 * 1024 + 1
  }, {}), null);
  assert.equal(canonicalAttachmentMetadata({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    sizeOriginal: 1234
  }, { attachmentWidth: 640 }), null);
});

test("sendmessage persists server attachment metadata instead of client claims", async () => {
  const originalEnv = snapshotEnv();
  const originalFetch = globalThis.fetch;
  let createdMessage = null;
  Object.assign(process.env, {
    APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
    APPWRITE_FUNCTION_PROJECT_ID: "project",
    APPWRITE_DATABASE_ID: "db",
    APPWRITE_THREADS_TABLE_ID: "threads",
    APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
    APPWRITE_MESSAGES_TABLE_ID: "messages",
    APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID: "attachments",
    APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships"
  });

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.pathname === "/v1/account") return jsonResponse(200, { $id: "user-a" });
    if (method === "GET" && url.pathname.endsWith("/tables/participants/rows")) {
      return jsonResponse(200, { rows: participantRows("thread-1") });
    }
    if (method === "GET" && url.pathname.includes("/tables/relationships/rows/")) {
      return jsonResponse(200, matchedRelationship("user-a", "user-b", "thread-1"));
    }
    if (method === "GET" && url.pathname.endsWith("/tables/threads/rows/thread-1")) {
      return jsonResponse(200, { $id: "thread-1", createdByUserId: "user-a", status: "active" });
    }
    if (method === "GET" && url.pathname.endsWith("/storage/buckets/attachments/files/file-a")) {
      return jsonResponse(200, {
        $id: "file-a",
        name: "photo.jpg",
        mimeType: "image/jpeg",
        sizeOriginal: 2048,
        $permissions: [
          'read("user:user-a")',
          'update("user:user-a")',
          'delete("user:user-a")'
        ]
      });
    }
    if (method === "PUT" && url.pathname.endsWith("/storage/buckets/attachments/files/file-a")) {
      return jsonResponse(200, { $id: "file-a" });
    }
    if (method === "POST" && url.pathname.endsWith("/tables/messages/rows")) {
      createdMessage = body;
      return jsonResponse(201, { $id: body.rowId, ...body.data });
    }
    if (method === "PATCH" && url.pathname.includes("/tables/")) {
      return jsonResponse(200, { $id: url.pathname.split("/").at(-1), ...body.data });
    }
    return jsonResponse(500, { message: `Unexpected ${method} ${url.pathname}` });
  };

  try {
    const result = await invokeHandler({
      threadId: "thread-1",
      attachmentFileId: "file-a",
      messageType: "file",
      attachmentName: "malware.exe",
      attachmentMimeType: "application/x-msdownload",
      attachmentSize: 1,
      attachmentWidth: 320,
      attachmentHeight: 200,
      currentUserId: "user-a"
    });
    assert.equal(result.status, 200);
    assert.equal(createdMessage.data.messageType, "image");
    assert.equal(createdMessage.data.attachmentName, "photo.jpg");
    assert.equal(createdMessage.data.attachmentMimeType, "image/jpeg");
    assert.equal(createdMessage.data.attachmentSize, 2048);
    assert.equal(createdMessage.data.attachmentWidth, 320);
    assert.equal(createdMessage.data.attachmentHeight, 200);
  } finally {
    restoreEnv(originalEnv);
    globalThis.fetch = originalFetch;
  }
});

test("message authorization requires a reciprocal match and the canonical thread", () => {
  const relationship = matchedRelationship("user-a", "user-b", "thread-1");
  assert.equal(relationshipAllowsMessaging(relationship, "user-a", "user-b", "thread-1"), true);
  assert.equal(relationshipAllowsMessaging({ ...relationship, userBState: "none" }, "user-a", "user-b", "thread-1"), false);
  assert.equal(relationshipAllowsMessaging(relationship, "user-a", "user-b", "thread-2"), false);
});

test("reply references are confined to the same thread", () => {
  assert.equal(isReplyInThread({ $id: "message-1", threadId: "thread-1" }, "message-1", "thread-1"), true);
  assert.equal(isReplyInThread({ $id: "message-1", threadId: "thread-2" }, "message-1", "thread-1"), false);
  assert.equal(isReplyInThread(null, "message-1", "thread-1"), false);
});

test("updateParticipant changes only allowed preferences through the server", async () => {
  const originalEnv = snapshotEnv();
  const originalFetch = globalThis.fetch;
  const patches = [];
  Object.assign(process.env, {
    APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
    APPWRITE_FUNCTION_PROJECT_ID: "project",
    APPWRITE_DATABASE_ID: "db",
    APPWRITE_THREADS_TABLE_ID: "threads",
    APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
    APPWRITE_MESSAGES_TABLE_ID: "messages",
    APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships"
  });

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.pathname === "/v1/account") {
      return jsonResponse(200, { $id: "user-a" });
    }
    if (method === "GET" && url.pathname.endsWith("/tables/participants/rows")) {
      return jsonResponse(200, { rows: participantRows("thread-1") });
    }
    if (method === "PATCH" && url.pathname.includes("/tables/participants/rows/")) {
      patches.push(body);
      return jsonResponse(200, { $id: url.pathname.split("/").at(-1), ...body.data });
    }
    return jsonResponse(500, { message: `Unexpected ${method} ${url.pathname}` });
  };

  try {
    const result = await invokeHandler({
      action: "updateParticipant",
      threadId: "thread-1",
      currentUserId: "user-a",
      markRead: true,
      pinned: true,
      notificationsEnabled: false
    });
    assert.equal(result.status, 200);
    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0].permissions.sort(), [
      'read("user:user-a")',
      'read("user:user-b")'
    ]);
    assert.equal(patches[0].data.threadId, "thread-1");
    assert.equal(patches[0].data.userId, "user-a");
    assert.equal(patches[0].data.role, "participant");
    assert.equal(patches[0].data.pinned, true);
    assert.equal(patches[0].data.notificationsEnabled, false);
    assert.ok(patches[0].data.lastReadAt);

    const rejected = await invokeHandler({
      action: "updateParticipant",
      threadId: "thread-1",
      currentUserId: "user-a",
      userId: "user-b",
      pinned: true
    });
    assert.equal(rejected.status, 400);
    assert.equal(patches.length, 1);
  } finally {
    restoreEnv(originalEnv);
    globalThis.fetch = originalFetch;
  }
});

for (const action of ["sendMessage", "updateParticipant"]) {
  test(`${action} preserves concurrent changes to participant state`, async () => {
    const originalEnv = snapshotEnv();
    const originalFetch = globalThis.fetch;
    Object.assign(process.env, {
      APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
      APPWRITE_FUNCTION_PROJECT_ID: "project",
      APPWRITE_DATABASE_ID: "db",
      APPWRITE_THREADS_TABLE_ID: "threads",
      APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
      APPWRITE_MESSAGES_TABLE_ID: "messages",
      APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships"
    });
    const rows = participantRows("thread-1");
    const latestRead = "2030-01-01T12:00:00.000Z";
    globalThis.fetch = async (input, options = {}) => {
      const path = new URL(String(input)).pathname;
      const method = options.method ?? "GET";
      const body = options.body ? JSON.parse(options.body) : null;
      if (path === "/v1/account") return jsonResponse(200, { $id: "user-a" });
      if (method === "GET" && path.endsWith("/tables/participants/rows")) {
        const snapshot = structuredClone(rows);
        // A second request commits after this request has read the rows.
        for (const row of rows) Object.assign(row, {
          notificationsEnabled: false, muted: true, lastReadAt: latestRead
        });
        return jsonResponse(200, { rows: snapshot });
      }
      if (method === "GET" && path.includes("/tables/relationships/rows/")) {
        return jsonResponse(200, matchedRelationship("user-a", "user-b", "thread-1"));
      }
      if (method === "GET" && path.endsWith("/tables/threads/rows/thread-1")) {
        return jsonResponse(200, { $id: "thread-1", status: "active" });
      }
      if (method === "PATCH" && path.includes("/tables/participants/rows/")) {
        const row = rows.find((item) => path.endsWith(`/rows/${item.$id}`));
        Object.assign(row, body.data);
        return jsonResponse(200, { ...row });
      }
      if (method === "PATCH" && path.endsWith("/tables/threads/rows/thread-1")) {
        return jsonResponse(200, { $id: "thread-1", ...body.data });
      }
      if (method === "POST" && path.endsWith("/tables/messages/rows")) {
        return jsonResponse(201, { $id: body.rowId, ...body.data });
      }
      return jsonResponse(500, { message: `Unexpected ${method} ${path}` });
    };
    try {
      const result = await invokeHandler(action === "sendMessage"
        ? { threadId: "thread-1", text: "ciao" }
        : { action, threadId: "thread-1", pinned: true });
      assert.equal(result.status, 200);
      for (const row of rows) {
        assert.equal(row.notificationsEnabled, false);
        assert.equal(row.muted, true);
        if (action === "updateParticipant" || row.userId === "user-b") {
          assert.equal(row.lastReadAt, latestRead);
        } else {
          assert.equal(row.lastReadAt, result.payload.createdAt);
        }
      }
      if (action === "updateParticipant") {
        assert.equal(rows[0].pinned, true);
        assert.equal(result.payload.notificationsEnabled, false);
        assert.equal(result.payload.lastReadAt, latestRead);
      }
    } finally {
      restoreEnv(originalEnv);
      globalThis.fetch = originalFetch;
    }
  });
}

async function invokeHandler(body, headers = {
  "x-appwrite-key": "server-key",
  "x-appwrite-user-jwt": "valid-jwt",
  "x-appwrite-user-id": "user-a"
}) {
  let responsePayload = null;
  let responseStatus = null;

  await handler({
    req: {
      bodyJson: body,
      headers
    },
    res: {
      json(payload, status = 200) {
        responsePayload = payload;
        responseStatus = status;
        return { payload, status };
      }
    },
    error() {}
  });

  return {
    payload: responsePayload,
    status: responseStatus
  };
}

function jsonResponse(status, payload) {
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

function participantRowId(threadId, userId) {
  return `tp_${createHash("sha256").update(`${threadId}:${userId}`).digest("hex").slice(0, 32)}`;
}

function participantRows(threadId) {
  return [
    {
      $id: participantRowId(threadId, "user-a"),
      threadId,
      userId: "user-a",
      role: "member",
      muted: false,
      pinned: false,
      notificationsEnabled: true
    },
    {
      $id: participantRowId(threadId, "user-b"),
      threadId,
      userId: "user-b",
      role: "member",
      muted: false,
      pinned: false,
      notificationsEnabled: true
    }
  ];
}

function matchedRelationship(userAId, userBId, threadId) {
  const userIds = [userAId, userBId].sort();
  return {
    $id: relationshipRowId(userIds),
    pairKey: userIds.join(":"),
    userAId: userIds[0],
    userBId: userIds[1],
    userAState: "matched",
    userBState: "matched",
    threadId,
    matchedAt: "2026-07-21T00:00:00.000Z"
  };
}

function relationshipRowId(userIds) {
  return `rl_${createHash("sha256").update(userIds.join(":")).digest("hex").slice(0, 32)}`;
}

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}
