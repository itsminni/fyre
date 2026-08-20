import test from "node:test";
import assert from "node:assert/strict";

import handler from "./main.js";

const ENV = {
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "database",
  APPWRITE_PROFILES_TABLE_ID: "profiles",
  APPWRITE_EVENTS_TABLE_ID: "events",
  APPWRITE_EVENT_REGISTRATIONS_TABLE_ID: "eventregistrations"
};

test("registration is idempotent and creates an owner-read-only row", async () => {
  await withEnvironment(async () => {
    const appwrite = makeFakeAppwrite();
    globalThis.fetch = appwrite.fetch;

    const first = await invoke("user-a");
    const second = await invoke("user-a");

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(second.payload, first.payload);
    assert.deepEqual(first.payload.counters, {
      maleCount: 1,
      femaleCount: 0,
      waitingListCount: 0
    });
    assert.equal(appwrite.registrations.size, 1);
    assert.deepEqual([...appwrite.registrations.values()][0].permissions, [
      'read("user:user-a")'
    ]);
  });
});

test("concurrent registrations serialize on the event row and cannot overbook", async () => {
  await withEnvironment(async () => {
    const appwrite = makeFakeAppwrite({
      event: { maxParticipants: 1, maleLimit: 1, femaleLimit: 1 },
      synchronizeFirstEmptyReads: true
    });
    globalThis.fetch = appwrite.fetch;

    const responses = await Promise.all([invoke("user-a"), invoke("user-b")]);
    const confirmed = [...appwrite.registrations.values()]
      .filter((row) => row.data.status === "confirmed");

    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.equal(responses.filter((response) => response.status === 409).length, 1);
    assert.equal(confirmed.length, 1);
    assert.ok(appwrite.conflictCount >= 1);
  });
});

test("capacity checks paginate through every registration", async () => {
  await withEnvironment(async () => {
    const seeded = Array.from({ length: 110 }, (_, index) => ({
      id: `existing-${index}`,
      data: {
        eventId: "event-1",
        userId: `existing-user-${index}`,
        gender: index % 2 ? "female" : "male",
        status: "confirmed",
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      permissions: []
    }));
    const appwrite = makeFakeAppwrite({
      event: { maxParticipants: 110, maleLimit: 110, femaleLimit: 110 },
      registrations: seeded
    });
    globalThis.fetch = appwrite.fetch;

    const response = await invoke("user-a");
    assert.equal(response.status, 409);
    assert.equal(response.payload.messageKey, "events.error.capacityFull");
    assert.ok(appwrite.registrationListCount >= 2);
    assert.equal(appwrite.registrations.size, 110);
  });
});

test("past or inactive events cannot be registered", async () => {
  await withEnvironment(async () => {
    const past = makeFakeAppwrite({
      event: { startsAt: new Date(Date.now() - 60_000).toISOString() }
    });
    globalThis.fetch = past.fetch;
    assert.equal((await invoke("user-a")).status, 404);

    const cancelled = makeFakeAppwrite({ event: { status: "cancelled" } });
    globalThis.fetch = cancelled.fetch;
    assert.equal((await invoke("user-a")).status, 404);
  });
});

async function invoke(userId) {
  let payload = null;
  let status = null;
  await handler({
    req: {
      bodyJson: { eventId: "event-1", currentUserId: userId },
      headers: {
        "x-appwrite-key": "server-key",
        "x-appwrite-user-jwt": `jwt-${userId}`,
        "x-appwrite-user-id": userId
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

function makeFakeAppwrite(options = {}) {
  const event = {
    $id: "event-1",
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    status: "active",
    maxParticipants: 48,
    maleLimit: 24,
    femaleLimit: 24,
    ...options.event
  };
  const registrations = new Map(
    (options.registrations ?? []).map((row) => [row.id, row])
  );
  const transactions = new Map();
  let transactionSequence = 0;
  let eventVersion = 0;
  let conflictCount = 0;
  let registrationListCount = 0;
  let emptyReadArrivals = 0;
  let releaseEmptyReads;
  const emptyReadBarrier = new Promise((resolve) => {
    releaseEmptyReads = resolve;
  });

  const api = {
    registrations,
    get conflictCount() {
      return conflictCount;
    },
    get registrationListCount() {
      return registrationListCount;
    },
    async fetch(input, requestOptions = {}) {
      const url = new URL(String(input));
      const method = requestOptions.method ?? "GET";
      const body = requestOptions.body ? JSON.parse(requestOptions.body) : {};

      if (url.pathname === "/v1/account") {
        const jwt = requestOptions.headers?.["X-Appwrite-JWT"];
        return response(200, { $id: String(jwt).replace(/^jwt-/, "") });
      }

      if (method === "POST" && url.pathname === "/v1/tablesdb/transactions") {
        const id = `transaction-${++transactionSequence}`;
        transactions.set(id, { baseEventVersion: eventVersion, operations: [], touchedEvent: false });
        return response(201, { $id: id });
      }

      const transactionMatch = url.pathname.match(/^\/v1\/tablesdb\/transactions\/([^/]+)$/);
      if (transactionMatch && method === "PATCH") {
        const transaction = transactions.get(transactionMatch[1]);
        if (body.rollback) {
          return response(200, { $id: transactionMatch[1], status: "rolled_back" });
        }
        if (body.commit && transaction.touchedEvent && transaction.baseEventVersion !== eventVersion) {
          conflictCount += 1;
          return response(409, { type: "transaction_conflict", message: "Transaction conflict" });
        }
        for (const operation of transaction.operations) {
          registrations.set(operation.id, operation.row);
        }
        if (transaction.touchedEvent) {
          eventVersion += 1;
        }
        return response(200, { $id: transactionMatch[1], status: "committed" });
      }

      if (url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return response(200, { $id: "user-a", userId: "user-a", gender: "male", orientation: "straight" });
      }
      if (url.pathname.endsWith("/tables/profiles/rows/user-b")) {
        return response(200, { $id: "user-b", userId: "user-b", gender: "female", orientation: "straight" });
      }
      if (url.pathname.endsWith("/tables/events/rows/event-1") && method === "GET") {
        return response(200, event);
      }
      if (url.pathname.endsWith("/tables/events/rows/event-1") && method === "PATCH") {
        transactions.get(body.transactionId).touchedEvent = true;
        return response(200, event);
      }

      if (url.pathname.endsWith("/tables/eventregistrations/rows") && method === "GET") {
        registrationListCount += 1;
        const rows = [...registrations.entries()].map(([id, row]) => ({ $id: id, ...row.data }));
        if (options.synchronizeFirstEmptyReads && rows.length === 0 && emptyReadArrivals < 2) {
          emptyReadArrivals += 1;
          if (emptyReadArrivals === 2) {
            releaseEmptyReads();
          }
          await emptyReadBarrier;
        }
        const queries = url.searchParams.getAll("queries[]").map((value) => JSON.parse(value));
        const limit = queries.find((query) => query.method === "limit")?.values?.[0] ?? 25;
        const offset = queries.find((query) => query.method === "offset")?.values?.[0] ?? 0;
        return response(200, { rows: rows.slice(offset, offset + limit) });
      }

      if (url.pathname.endsWith("/tables/eventregistrations/rows") && method === "POST") {
        const transaction = transactions.get(body.transactionId);
        transaction.operations.push({
          id: body.rowId,
          row: { data: body.data, permissions: body.permissions }
        });
        return response(201, { $id: body.rowId, ...body.data });
      }

      if (url.pathname.includes("/tables/eventregistrations/rows/") && method === "PATCH") {
        const id = url.pathname.split("/").at(-1);
        const transaction = transactions.get(body.transactionId);
        const existing = registrations.get(id) ?? { data: {}, permissions: [] };
        transaction.operations.push({
          id,
          row: {
            data: { ...existing.data, ...body.data },
            permissions: body.permissions ?? existing.permissions
          }
        });
        return response(200, { $id: id, ...existing.data, ...body.data });
      }

      return response(500, { message: `Unexpected ${method} ${url.pathname}` });
    }
  };
  return api;
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
