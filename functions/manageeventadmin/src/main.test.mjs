import test from "node:test";
import assert from "node:assert/strict";

import handler from "./main.js";

const ENV = {
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "database",
  APPWRITE_PROFILES_TABLE_ID: "profiles",
  APPWRITE_EVENTS_TABLE_ID: "events",
  APPWRITE_EVENT_REGISTRATIONS_TABLE_ID: "eventregistrations",
  APPWRITE_EVENT_ADMIN_USER_IDS: "admin-user",
  APPWRITE_EVENT_ADMIN_EMAILS: ""
};

test("admin bootstrap by canonical account id does not require a profile or event ACL fields", async () => {
  await withEnvironment({}, async () => {
    const requestedPaths = [];
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      requestedPaths.push(request.path);
      if (request.path === "/v1/account") {
        return response(200, { $id: "admin-user", email: "unverified@example.test", emailVerification: false });
      }
      if (request.path.endsWith("/tables/events/rows/event-1")) {
        return response(200, futureEvent({ adminUserIds: "attacker", adminEmails: "attacker@example.test" }));
      }
      if (isRegistrationList(request)) {
        return response(200, { rows: [] });
      }
      return unexpected(request);
    };

    const result = await invoke({ action: "fetch", eventId: "event-1" });

    assert.equal(result.status, 200);
    assert.equal(result.payload.isAdmin, true);
    assert.equal(result.payload.event.maleCount, 0);
    assert.equal(result.payload.event.femaleCount, 0);
    assert.equal(result.payload.event.waitingListCount, 0);
    assert.equal(Object.hasOwn(result.payload.event, "adminUserIds"), false);
    assert.equal(Object.hasOwn(result.payload.event, "adminEmails"), false);
    assert.equal(requestedPaths.some((path) => path.includes("/tables/profiles/")), false);
  });
});

test("only a verified canonical /account email can satisfy the email allowlist", async () => {
  await withEnvironment({
    APPWRITE_EVENT_ADMIN_USER_IDS: "",
    APPWRITE_EVENT_ADMIN_EMAILS: "trusted@example.test"
  }, async () => {
    let account = {
      $id: "ordinary-user",
      email: "trusted@example.test",
      emailVerification: true
    };
    let profileRequests = 0;
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") {
        return response(200, account);
      }
      if (request.path.includes("/tables/profiles/")) {
        profileRequests += 1;
        return response(200, {
          $id: "ordinary-user",
          userId: "ordinary-user",
          email: "trusted@example.test"
        });
      }
      if (request.path.endsWith("/tables/events/rows/event-1")) {
        return response(200, futureEvent());
      }
      if (isRegistrationList(request)) {
        return response(200, { rows: [] });
      }
      return unexpected(request);
    };

    const allowed = await invoke({ action: "fetch", eventId: "event-1" }, {
      bodyUserId: "ordinary-user",
      headerUserId: "ordinary-user"
    });
    assert.equal(allowed.status, 200);

    account = {
      $id: "ordinary-user",
      email: "ordinary@example.test",
      emailVerification: true
    };
    const spoofedProfile = await invoke({ action: "fetch", eventId: "event-1" }, {
      bodyUserId: "ordinary-user",
      headerUserId: "ordinary-user"
    });
    assert.equal(spoofedProfile.status, 403);

    account = {
      $id: "ordinary-user",
      email: "trusted@example.test",
      emailVerification: false
    };
    const unverifiedEmail = await invoke({ action: "fetch", eventId: "event-1" }, {
      bodyUserId: "ordinary-user",
      headerUserId: "ordinary-user"
    });
    assert.equal(unverifiedEmail.status, 403);
    assert.equal(profileRequests, 0);
  });
});

test("header or body identity mismatch is rejected before event access", async () => {
  await withEnvironment({}, async () => {
    let eventRequests = 0;
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") {
        return response(200, { $id: "admin-user", email: "admin@example.test", emailVerification: true });
      }
      eventRequests += 1;
      return unexpected(request);
    };

    const bodyMismatch = await invoke({ action: "fetch", eventId: "event-1" }, {
      bodyUserId: "other-user",
      headerUserId: "admin-user"
    });
    assert.equal(bodyMismatch.status, 403);

    const headerMismatch = await invoke({ action: "fetch", eventId: "event-1" }, {
      bodyUserId: "admin-user",
      headerUserId: "other-user"
    });
    assert.equal(headerMismatch.status, 403);
    assert.equal(eventRequests, 0);
  });
});

test("upcoming event lookup is filtered, ordered and limited by Appwrite", async () => {
  await withEnvironment({}, async () => {
    let eventQueries = null;
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") {
        return response(200, { $id: "admin-user" });
      }
      if (request.path.endsWith("/tables/events/rows")) {
        eventQueries = queries(request.url);
        return response(200, { rows: [futureEvent()] });
      }
      if (isRegistrationList(request)) {
        return response(200, { rows: [] });
      }
      return unexpected(request);
    };

    const result = await invoke({ action: "fetch" });

    assert.equal(result.status, 200);
    assert.deepEqual(query(eventQueries, "equal", "status")?.values, ["active"]);
    assert.equal(query(eventQueries, "greaterThanEqual", "startsAt")?.values.length, 1);
    assert.equal(query(eventQueries, "orderAsc", "startsAt")?.attribute, "startsAt");
    assert.deepEqual(query(eventQueries, "limit")?.values, [1]);
  });
});

test("participant id lookup uses Users API and failures never log the identifier", async () => {
  await withEnvironment({}, async () => {
    const requestedPaths = [];
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      requestedPaths.push(request.path);
      if (request.path === "/v1/account") {
        return response(200, { $id: "admin-user" });
      }
      if (request.path.endsWith("/tables/events/rows/event-1")) {
        return response(200, futureEvent());
      }
      if (request.path === "/v1/users/private-user-id") {
        return response(404, { message: "private-user-id was not found", type: "user_not_found" });
      }
      return unexpected(request);
    };

    const result = await invoke({
      action: "addParticipant",
      eventId: "event-1",
      userLookup: "private-user-id",
      status: "confirmed"
    });

    assert.equal(result.status, 404);
    assert.equal(result.payload.messageKey, "events.admin.error.userNotFound");
    assert.ok(requestedPaths.includes("/v1/users/private-user-id"));
    assert.equal(result.errors.join("\n").includes("private-user-id"), false);
  });
});

test("admin roster uses a bounded cursor page and one profile batch per page", async () => {
  await withEnvironment({}, async () => {
    const registrations = Array.from({ length: 101 }, (_, index) => ({
      $id: `reg-${String(index).padStart(3, "0")}`,
      userId: `user-${String(index).padStart(3, "0")}`,
      gender: index % 2 === 0 ? "male" : "female",
      status: index === 100 ? "waitlisted" : "confirmed",
      createdAt: new Date(Date.UTC(2090, 0, 1, 0, 0, index % 60)).toISOString()
    }));
    const registrationQueries = [];
    const profileQueries = [];

    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") {
        return response(200, { $id: "admin-user" });
      }
      if (request.path.endsWith("/tables/events/rows/event-1")) {
        return response(200, futureEvent({ maleCount: 50, femaleCount: 50, waitingListCount: 1 }));
      }
      if (isRegistrationList(request)) {
        const items = queries(request.url);
        registrationQueries.push(items);
        const cursor = query(items, "cursorAfter")?.values?.[0] ?? null;
        const pageLimit = query(items, "limit")?.values?.[0] ?? 25;
        const startIndex = cursor
          ? registrations.findIndex((row) => row.$id === cursor) + 1
          : 0;
        return response(200, { rows: registrations.slice(startIndex, startIndex + pageLimit) });
      }
      if (isProfileList(request)) {
        const items = queries(request.url);
        profileQueries.push(items);
        const userIds = query(items, "equal", "$id")?.values ?? [];
        return response(200, { rows: userIds.map((userId) => {
          const row = registrations.find((registration) => registration.userId === userId);
          return canonicalProfile(userId, row?.gender ?? "male", `${userId}@example.test`);
        }) });
      }
      return unexpected(request);
    };

    const first = await invoke({
      action: "fetch",
      eventId: "event-1",
      participantLimit: 100
    });
    const second = await invoke({
      action: "fetch",
      eventId: "event-1",
      participantLimit: 100,
      participantCursor: first.payload.participantPage.nextCursor
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.payload.participants.length, 100);
    assert.equal(second.payload.participants.length, 1);
    assert.equal(first.payload.participantPage.nextCursor, "reg-099");
    assert.equal(second.payload.participantPage.nextCursor, null);
    assert.equal(first.payload.participantPage.total, 101);
    assert.equal(first.payload.event.maleCount, 50);
    assert.equal(first.payload.event.femaleCount, 50);
    assert.equal(first.payload.event.waitingListCount, 1);
    assert.equal(registrationQueries.length, 3);
    assert.equal(Math.max(...registrationQueries.map((items) => query(items, "limit")?.values?.[0] ?? 0)), 100);
    assert.equal(profileQueries.length, 2);
    assert.equal(query(registrationQueries[0], "orderAsc", "$id")?.attribute, "$id");
    assert.equal(query(registrationQueries[0], "offset"), undefined);
    assert.deepEqual(query(registrationQueries[1], "cursorAfter")?.values, ["reg-099"]);
    assert.deepEqual(query(registrationQueries[2], "cursorAfter")?.values, ["reg-099"]);
    assert.equal(query(profileQueries[0], "equal", "$id")?.values.length, 100);
  });
});

test("admin roster rejects limits above the safe API cap before reading registrations", async () => {
  await withEnvironment({}, async () => {
    let registrationRequests = 0;
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") return response(200, { $id: "admin-user" });
      if (request.path.endsWith("/tables/events/rows/event-1")) return response(200, futureEvent());
      if (isRegistrationList(request)) registrationRequests += 1;
      return unexpected(request);
    };

    const result = await invoke({
      action: "fetch",
      eventId: "event-1",
      participantLimit: 101
    });

    assert.equal(result.status, 400);
    assert.equal(registrationRequests, 0);
  });
});

test("adding by email resolves the canonical Users account and persists counters transactionally", async () => {
  await withEnvironment({}, async () => {
    let event = futureEvent();
    let registrations = [
      registration("reg-female", "female-user", "female", "confirmed", "2090-01-01T00:00:00.000Z"),
      registration("reg-wait", "waiting-user", "male", "waitlisted", "2090-01-01T00:01:00.000Z")
    ];
    const creates = [];
    const eventPatches = [];
    let usersQueries = null;
    let committed = false;

    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") {
        return response(200, { $id: "admin-user" });
      }
      if (request.path === "/v1/users") {
        usersQueries = queries(request.url);
        return response(200, { users: [{ $id: "new-user", email: "new@example.test" }] });
      }
      if (request.path.endsWith("/tables/profiles/rows/new-user")) {
        return response(200, canonicalProfile("new-user", "male", "new@example.test"));
      }
      if (request.path.includes("/tables/profiles/rows/")) {
        const userId = decodeURIComponent(request.path.split("/").at(-1));
        const gender = userId === "female-user" ? "female" : "male";
        return response(200, canonicalProfile(userId, gender, `${userId}@example.test`));
      }
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        return response(201, { $id: "tx-add" });
      }
      if (request.path === "/v1/tablesdb/transactions/tx-add" && request.method === "PATCH") {
        if (request.body.commit) committed = true;
        return response(200, {});
      }
      if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "GET") {
        return response(200, event);
      }
      if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "PATCH") {
        eventPatches.push(request.body);
        event = { ...event, ...request.body.data };
        return response(200, event);
      }
      if (isRegistrationList(request)) {
        return response(200, { rows: registrations });
      }
      if (isProfileList(request)) {
        const userIds = query(queries(request.url), "equal", "$id")?.values ?? [];
        return response(200, { rows: userIds.map((userId) => {
          const row = registrations.find((registrationRow) => registrationRow.userId === userId);
          const gender = row?.gender ?? (userId === "female-user" ? "female" : "male");
          return canonicalProfile(userId, gender, `${userId}@example.test`);
        }) });
      }
      if (request.path.endsWith("/tables/eventregistrations/rows") && request.method === "POST") {
        creates.push(request.body);
        const row = { $id: request.body.rowId, ...request.body.data };
        registrations = [...registrations, row];
        return response(201, row);
      }
      return unexpected(request);
    };

    const result = await invoke({
      action: "addParticipant",
      eventId: "event-1",
      userLookup: " NEW@EXAMPLE.TEST ",
      status: "confirmed"
    });

    assert.equal(result.status, 200);
    assert.equal(committed, true);
    assert.deepEqual(query(usersQueries, "equal", "email")?.values, ["new@example.test"]);
    assert.equal(creates.length, 1);
    assert.equal(creates[0].transactionId, "tx-add");
    assert.deepEqual(creates[0].permissions, ['read("user:new-user")']);
    assert.deepEqual(eventPatches.at(-1).data, {
      maleCount: 1,
      femaleCount: 1,
      waitingListCount: 1
    });
    assert.equal(eventPatches.at(-1).transactionId, "tx-add");
    assert.equal(result.payload.event.maleCount, 1);
    assert.equal(result.payload.event.femaleCount, 1);
    assert.equal(result.payload.event.waitingListCount, 1);
  });
});

test("removal promotes the earliest same-gender waitlist row and updates read-only ACLs and counters", async () => {
  await withEnvironment({}, async () => {
    let event = futureEvent();
    let registrations = [
      registration("reg-remove", "male-confirmed", "male", "confirmed", "2090-01-01T00:00:00.000Z"),
      registration("reg-male-wait", "male-wait", "male", "waitlisted", "2090-01-01T00:01:00.000Z"),
      registration("reg-female", "female-confirmed", "female", "confirmed", "2090-01-01T00:02:00.000Z"),
      registration("reg-female-wait", "female-wait", "female", "waitlisted", "2090-01-01T00:03:00.000Z")
    ];
    const registrationPatches = [];
    const eventPatches = [];
    let committed = false;

    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") {
        return response(200, { $id: "admin-user" });
      }
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        return response(201, { $id: "tx-remove" });
      }
      if (request.path === "/v1/tablesdb/transactions/tx-remove" && request.method === "PATCH") {
        if (request.body.commit) committed = true;
        return response(200, {});
      }
      if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "GET") {
        return response(200, event);
      }
      if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "PATCH") {
        eventPatches.push(request.body);
        event = { ...event, ...request.body.data };
        return response(200, event);
      }
      if (request.path.endsWith("/tables/eventregistrations/rows/reg-remove") && request.method === "GET") {
        return response(200, registrations.find((row) => row.$id === "reg-remove"));
      }
      if (isRegistrationList(request)) {
        return response(200, { rows: registrations });
      }
      if (request.path.includes("/tables/eventregistrations/rows/") && request.method === "PATCH") {
        registrationPatches.push(request);
        const rowId = decodeURIComponent(request.path.split("/").at(-1));
        registrations = registrations.map((row) => row.$id === rowId ? { ...row, ...request.body.data } : row);
        return response(200, registrations.find((row) => row.$id === rowId));
      }
      if (isProfileList(request)) {
        const userIds = query(queries(request.url), "equal", "$id")?.values ?? [];
        return response(200, { rows: userIds.map((userId) => {
          const row = registrations.find((registrationRow) => registrationRow.userId === userId);
          return canonicalProfile(userId, row?.gender ?? "male", `${userId}@example.test`);
        }) });
      }
      return unexpected(request);
    };

    const result = await invoke({
      action: "removeParticipant",
      eventId: "event-1",
      registrationId: "reg-remove"
    });

    assert.equal(result.status, 200);
    assert.equal(committed, true);
    assert.equal(registrationPatches.length, 2);
    const removedPatch = registrationPatches.find((request) => request.path.endsWith("/reg-remove"));
    const promotedPatch = registrationPatches.find((request) => request.path.endsWith("/reg-male-wait"));
    assert.equal(removedPatch.body.data.status, "cancelled");
    assert.deepEqual(removedPatch.body.permissions, ['read("user:male-confirmed")']);
    assert.equal(promotedPatch.body.data.status, "promoted");
    assert.deepEqual(promotedPatch.body.permissions, ['read("user:male-wait")']);
    assert.equal(registrationPatches.some((request) => request.path.endsWith("/reg-female-wait")), false);
    assert.deepEqual(eventPatches.at(-1).data, {
      maleCount: 1,
      femaleCount: 1,
      waitingListCount: 1
    });
    assert.equal(eventPatches.at(-1).transactionId, "tx-remove");
    assert.equal(result.payload.event.waitingListCount, 1);
  });
});

test("event validation rejects invalid bounds, dates, lengths and limits below active counters", async () => {
  const invalidPayloads = [
    { title: "x".repeat(201) },
    { place: "x".repeat(257) },
    { description: "x".repeat(4_001) },
    { rules: Array.from({ length: 51 }, () => "rule") },
    { rules: ["x".repeat(501)] },
    { maxParticipants: 1 },
    { maxParticipants: 501 },
    { maleLimit: -1 },
    { femaleLimit: 501 },
    { maleLimit: 1.5 },
    { status: "published" },
    { startsAt: "2099-02-31T12:00:00Z" },
    { registrationClosesAt: "2100-01-01T00:00:00.000Z" },
    { cancellationClosesAt: "not-an-iso-date" },
    { maxParticipants: 2 },
    { maleLimit: 1 },
    { femaleLimit: 0 }
  ];

  for (const invalidPayload of invalidPayloads) {
    await withEnvironment({}, async () => {
      const registrations = [
        registration("male-1", "male-1", "male", "confirmed"),
        registration("male-2", "male-2", "male", "promoted"),
        registration("female-1", "female-1", "female", "confirmed")
      ];
      let committed = false;
      let rolledBack = false;
      let eventPatchCount = 0;
      globalThis.fetch = async (input, options = {}) => {
        const request = parseRequest(input, options);
        if (request.path === "/v1/account") return response(200, { $id: "admin-user" });
        if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
          return response(201, { $id: "tx-validation" });
        }
        if (request.path === "/v1/tablesdb/transactions/tx-validation" && request.method === "PATCH") {
          if (request.body.commit) committed = true;
          if (request.body.rollback) rolledBack = true;
          return response(200, {});
        }
        if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "GET") {
          return response(200, futureEvent());
        }
        if (isRegistrationList(request)) return response(200, { rows: registrations });
        if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "PATCH") {
          eventPatchCount += 1;
          return response(200, futureEvent());
        }
        return unexpected(request);
      };

      const result = await invoke({ action: "updateEvent", eventId: "event-1", ...invalidPayload });
      assert.ok(result.status === 400 || result.status === 409, JSON.stringify(invalidPayload));
      assert.equal(committed, false);
      assert.equal(rolledBack, true);
      assert.equal(eventPatchCount, 0);
    });
  }
});

test("valid event update ignores body admin scope and synchronizes active counters", async () => {
  await withEnvironment({}, async () => {
    const registrations = [
      registration("male-1", "male-1", "male", "confirmed"),
      registration("female-1", "female-1", "female", "promoted"),
      registration("wait-1", "wait-1", "female", "waitlisted")
    ];
    let event = futureEvent();
    let eventPatch = null;
    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") return response(200, { $id: "admin-user" });
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        return response(201, { $id: "tx-update" });
      }
      if (request.path === "/v1/tablesdb/transactions/tx-update" && request.method === "PATCH") {
        return response(200, {});
      }
      if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "GET") {
        return response(200, event);
      }
      if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "PATCH") {
        eventPatch = request.body;
        event = { ...event, ...request.body.data };
        return response(200, event);
      }
      if (isRegistrationList(request)) return response(200, { rows: registrations });
      if (isProfileList(request)) {
        const userIds = query(queries(request.url), "equal", "$id")?.values ?? [];
        return response(200, { rows: userIds.map((userId) => {
          const row = registrations.find((registrationRow) => registrationRow.userId === userId);
          return canonicalProfile(userId, row.gender, `${userId}@example.test`);
        }) });
      }
      return unexpected(request);
    };

    const result = await invoke({
      action: "updateEvent",
      eventId: "event-1",
      title: "Updated event",
      place: "Venue",
      description: "Description",
      rules: ["Rule one"],
      maxParticipants: 20,
      maleLimit: 10,
      femaleLimit: 10,
      registrationClosesAt: "2099-05-30T12:00:00.000Z",
      cancellationClosesAt: null,
      adminUserIds: "attacker",
      adminEmails: "attacker@example.test"
    });

    assert.equal(result.status, 200);
    assert.equal(eventPatch.transactionId, "tx-update");
    assert.equal(eventPatch.data.title, "Updated event");
    assert.equal(eventPatch.data.place, "Venue");
    assert.equal(eventPatch.data.maleCount, 1);
    assert.equal(eventPatch.data.femaleCount, 1);
    assert.equal(eventPatch.data.waitingListCount, 1);
    assert.equal(eventPatch.data.cancellationClosesAt, null);
    assert.deepEqual(eventPatch.permissions, ['read("users")']);
    assert.equal(Object.hasOwn(eventPatch.data, "adminUserIds"), false);
    assert.equal(Object.hasOwn(eventPatch.data, "adminEmails"), false);
  });
});

test("event publication state and read ACL change atomically in the same transaction", async () => {
  await withEnvironment({}, async () => {
    let event = futureEvent({ status: "active", $permissions: ['read("users")'] });
    const patches = [];

    globalThis.fetch = async (input, options = {}) => {
      const request = parseRequest(input, options);
      if (request.path === "/v1/account") return response(200, { $id: "admin-user" });
      if (request.path === "/v1/tablesdb/transactions" && request.method === "POST") {
        return response(201, { $id: "tx-publication" });
      }
      if (request.path === "/v1/tablesdb/transactions/tx-publication" && request.method === "PATCH") {
        return response(200, {});
      }
      if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "GET") {
        return response(200, event);
      }
      if (request.path.endsWith("/tables/events/rows/event-1") && request.method === "PATCH") {
        patches.push(request.body);
        event = {
          ...event,
          ...request.body.data,
          $permissions: request.body.permissions ?? event.$permissions
        };
        return response(200, event);
      }
      if (isRegistrationList(request)) return response(200, { rows: [] });
      return unexpected(request);
    };

    const archived = await invoke({ action: "updateEvent", eventId: "event-1", status: "archived" });
    assert.equal(archived.status, 200);
    assert.equal(patches[0].transactionId, "tx-publication");
    assert.equal(patches[0].data.status, "archived");
    assert.deepEqual(patches[0].permissions, []);

    const republished = await invoke({ action: "updateEvent", eventId: "event-1", status: "active" });
    assert.equal(republished.status, 200);
    assert.equal(patches[1].transactionId, "tx-publication");
    assert.equal(patches[1].data.status, "active");
    assert.deepEqual(patches[1].permissions, ['read("users")']);
  });
});

async function invoke(body, options = {}) {
  let payload = null;
  let status = null;
  const errors = [];
  const bodyUserId = options.bodyUserId ?? "admin-user";
  const headerUserId = options.headerUserId ?? "admin-user";
  await handler({
    req: {
      bodyJson: { ...body, currentUserId: bodyUserId },
      headers: {
        "x-appwrite-key": "server-key",
        "x-appwrite-user-jwt": "valid-jwt",
        "x-appwrite-user-id": headerUserId
      }
    },
    res: {
      json(nextPayload, nextStatus = 200) {
        payload = nextPayload;
        status = nextStatus;
        return { payload, status };
      }
    },
    error(message) {
      errors.push(message);
    }
  });
  return { payload, status, errors };
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

function queries(url) {
  return url.searchParams.getAll("queries[]").map((value) => JSON.parse(value));
}

function query(items, method, attribute = undefined) {
  return items?.find((item) => item.method === method && (attribute === undefined || item.attribute === attribute));
}

function isRegistrationList(request) {
  return request.method === "GET" && request.path.endsWith("/tables/eventregistrations/rows");
}

function isProfileList(request) {
  return request.method === "GET" && request.path.endsWith("/tables/profiles/rows");
}

function futureEvent(overrides = {}) {
  return {
    $id: "event-1",
    title: "Event",
    place: "Old venue",
    description: "Old description",
    rules: [],
    status: "active",
    startsAt: "2099-06-01T12:00:00.000Z",
    maxParticipants: 48,
    maleLimit: 24,
    femaleLimit: 24,
    registrationClosesAt: "2099-05-31T12:00:00.000Z",
    cancellationClosesAt: "2099-05-31T12:00:00.000Z",
    maleCount: 0,
    femaleCount: 0,
    waitingListCount: 0,
    ...overrides
  };
}

function registration(id, userId, gender, status, createdAt = "2090-01-01T00:00:00.000Z") {
  return { $id: id, eventId: "event-1", userId, gender, status, createdAt };
}

function canonicalProfile(userId, gender, email) {
  return { $id: userId, userId, gender, email, firstName: userId };
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

function unexpected(request) {
  return response(500, { message: `Unexpected ${request.method} ${request.path}` });
}

async function withEnvironment(overrides, run) {
  const originalFetch = globalThis.fetch;
  const keys = Object.keys(ENV);
  const snapshot = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, ENV, overrides);
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
