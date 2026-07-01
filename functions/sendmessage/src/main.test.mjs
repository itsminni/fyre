import test from "node:test";
import assert from "node:assert/strict";

import handler from "./main.js";

const ENV_KEYS = [
  "APPWRITE_FUNCTION_API_ENDPOINT",
  "APPWRITE_FUNCTION_PROJECT_ID",
  "APPWRITE_FUNCTION_API_KEY",
  "APPWRITE_DATABASE_ID",
  "APPWRITE_THREADS_TABLE_ID",
  "APPWRITE_THREAD_PARTICIPANTS_TABLE_ID",
  "APPWRITE_MESSAGES_TABLE_ID",
  "APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID",
  "APPWRITE_RELATIONSHIPS_TABLE_ID",
  "APPWRITE_MATCHES_TABLE_ID"
];

test("sendmessage recreates a missing thread row from existing participant rows", async () => {
  const originalEnv = snapshotEnv();
  const originalFetch = globalThis.fetch;
  const requests = [];

  Object.assign(process.env, {
    APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
    APPWRITE_FUNCTION_PROJECT_ID: "project",
    APPWRITE_FUNCTION_API_KEY: "key",
    APPWRITE_DATABASE_ID: "db",
    APPWRITE_THREADS_TABLE_ID: "threads",
    APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
    APPWRITE_MESSAGES_TABLE_ID: "messages"
  });
  delete process.env.APPWRITE_RELATIONSHIPS_TABLE_ID;
  delete process.env.APPWRITE_MATCHES_TABLE_ID;

  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const request = {
      method: options.method,
      path: parsed.pathname,
      body: options.body ? JSON.parse(options.body) : null
    };
    requests.push(request);

    if (request.method === "GET" && request.path.endsWith("/tables/participants/rows")) {
      return jsonResponse(200, {
        rows: [
          { $id: "participant-current", threadId: "thread-1", userId: "user-a" },
          { $id: "participant-other", threadId: "thread-1", userId: "user-b" }
        ]
      });
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
    assert.equal(threadCreate.body.data.subject, "Fyre match");
    assert.deepEqual(threadCreate.body.permissions.sort(), [
      'delete("user:user-a")',
      'delete("user:user-b")',
      'read("user:user-a")',
      'read("user:user-b")',
      'update("user:user-a")',
      'update("user:user-b")'
    ]);
  } finally {
    restoreEnv(originalEnv);
    globalThis.fetch = originalFetch;
  }
});

async function invokeHandler(body, headers = { "x-appwrite-user-id": "user-a" }) {
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
    error(message) {
      throw new Error(message);
    }
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
    async text() {
      return JSON.stringify(payload);
    }
  };
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
