import test from "node:test";
import assert from "node:assert/strict";

import handler, { eventCounters, selectPromotionCandidate } from "./main.js";

test("selectPromotionCandidate picks the oldest waitlisted registration of the same gender", () => {
  const registrations = [
    {
      $id: "wait-f-newer",
      status: "waitlisted",
      gender: "female",
      createdAt: "2026-04-20T12:00:00.000Z"
    },
    {
      $id: "wait-m-older",
      status: "waitlisted",
      gender: "male",
      createdAt: "2026-04-20T09:00:00.000Z"
    },
    {
      $id: "wait-m-oldest",
      status: "waitlisted",
      gender: "male",
      createdAt: "2026-04-20T08:00:00.000Z"
    }
  ];

  const candidate = selectPromotionCandidate(registrations, {
    gender: "male"
  });

  assert.equal(candidate?.$id, "wait-m-oldest");
});

test("eventCounters counts promoted registrations and excludes cancelled rows", () => {
  assert.deepEqual(eventCounters([
    { status: "cancelled", gender: "male" },
    { status: "promoted", gender: "male" },
    { status: "confirmed", gender: "female" },
    { status: "waitlisted", gender: "female" }
  ]), {
    maleCount: 1,
    femaleCount: 1,
    waitingListCount: 1
  });
});

test("client force cannot bypass the server cancellation deadline", async () => {
  const env = {
    APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
    APPWRITE_FUNCTION_PROJECT_ID: "project",
    APPWRITE_DATABASE_ID: "database",
    APPWRITE_EVENTS_TABLE_ID: "events",
    APPWRITE_EVENT_REGISTRATIONS_TABLE_ID: "eventregistrations"
  };
  const snapshot = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const mutations = [];
  Object.assign(process.env, env);

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.pathname === "/v1/account") {
      return response(200, { $id: "user-a" });
    }
    if (method === "POST" && url.pathname === "/v1/tablesdb/transactions") {
      return response(201, { $id: "transaction-1" });
    }
    if (url.pathname.endsWith("/tables/events/rows/event-1")) {
      return response(200, {
        $id: "event-1",
        status: "active",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        cancellationClosesAt: new Date(Date.now() - 60_000).toISOString()
      });
    }
    if (method === "GET" && url.pathname.endsWith("/tables/eventregistrations/rows")) {
      return response(200, {
        rows: [{
          $id: "registration-1",
          eventId: "event-1",
          userId: "user-a",
          gender: "male",
          status: "confirmed",
          createdAt: "2026-01-01T00:00:00.000Z"
        }]
      });
    }
    if (method === "PATCH" && url.pathname === "/v1/tablesdb/transactions/transaction-1") {
      if (!body.rollback) {
        mutations.push({ url: url.pathname, body });
      }
      return response(200, { $id: "transaction-1" });
    }
    if (method === "PATCH") {
      mutations.push({ url: url.pathname, body });
    }
    return response(500, { message: `Unexpected ${method} ${url.pathname}` });
  };

  try {
    let payload = null;
    let status = null;
    await handler({
      req: {
        bodyJson: { eventId: "event-1", currentUserId: "user-a", force: true },
        headers: {
          "x-appwrite-key": "server-key",
          "x-appwrite-user-jwt": "valid-jwt",
          "x-appwrite-user-id": "user-a"
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

    assert.equal(status, 409);
    assert.equal(payload.messageKey, "events.error.cancellationClosed");
    assert.deepEqual(mutations, []);
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
});

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
