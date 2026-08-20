import test from "node:test";
import assert from "node:assert/strict";

import manageProfile from "./main.js";

const ENV = {
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "database",
  APPWRITE_PROFILES_TABLE_ID: "profiles",
  APPWRITE_AVATARS_BUCKET_ID: "avatars"
};

test("upsert binds profile identity to the verified account and grants read-only owner access", async () => {
  await withEnvironment(async () => {
    const requests = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      requests.push({ url, method, body: init.body ? JSON.parse(init.body) : null });

      if (url.pathname === "/v1/account") {
        return jsonResponse(200, { $id: "user-a", email: "Owner@Example.com" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(404, { message: "Not found" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows")) {
        return jsonResponse(200, { rows: [] });
      }
      if (method === "POST" && url.pathname.endsWith("/tables/profiles/rows")) {
        return jsonResponse(201, { $id: "user-a" });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const response = await invoke({
      firstName: " Ada ",
      city: "Rome",
      birthDate: "1990-02-03",
      gender: "female",
      orientation: "bisexual",
      bio: "Hello",
      instagramTag: " @ ada lovelace ",
      spotifyTag: " @ ada mixes ",
      userId: "victim-user",
      email: "victim@example.com",
      preferredGenders: ["male"]
    });
    assert.equal(response.status, 200);

    const create = requests.find((request) => request.method === "POST");
    assert.equal(create.body.rowId, "user-a");
    assert.equal(create.body.data.userId, "user-a");
    assert.equal(create.body.data.email, "owner@example.com");
    assert.equal(create.body.data.profileReady, true);
    assert.equal(create.body.data.instagramTag, "adalovelace");
    assert.equal(create.body.data.spotifyTag, "adamixes");
    assert.deepEqual(create.body.permissions, ['read("user:user-a")']);
  });
});

test("upsert computes readiness from every canonical required profile field", async () => {
  await withEnvironment(async () => {
    const createdProfiles = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      if (url.pathname === "/v1/account") {
        return jsonResponse(200, { $id: "user-a", email: "owner@example.com" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(404, { message: "Not found" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows")) {
        return jsonResponse(200, { rows: [] });
      }
      if (method === "POST" && url.pathname.endsWith("/tables/profiles/rows")) {
        createdProfiles.push(JSON.parse(init.body).data);
        return jsonResponse(201, { $id: "user-a" });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const completeProfile = {
      firstName: "Ada",
      city: "Roma",
      birthDate: "1990-02-03",
      gender: "female",
      orientation: "bisexual",
      bio: "Hello",
      preferredGenders: ["male"]
    };

    assert.equal((await invoke(completeProfile)).payload.profileReady, true);
    assert.equal((await invoke({ ...completeProfile, orientation: null })).payload.profileReady, false);
    assert.equal((await invoke({ ...completeProfile, preferredGenders: [] })).payload.profileReady, false);
    assert.deepEqual(createdProfiles.map((profile) => profile.profileReady), [true, false, false]);
  });
});

test("upsert enforces canonical intent, age, distance and social-tag limits", async () => {
  await withEnvironment(async () => {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      if (url.pathname === "/v1/account") {
        return jsonResponse(200, { $id: "user-a", email: "owner@example.com" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(404, { message: "Not found" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows")) {
        return jsonResponse(200, { rows: [] });
      }
      if (method === "POST" && url.pathname.endsWith("/tables/profiles/rows")) {
        return jsonResponse(201, { $id: "user-a" });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const invalidInputs = [
      { intent: "unsupported" },
      { minPreferredAge: 35, maxPreferredAge: 35 },
      { minPreferredAge: 17, maxPreferredAge: 35 },
      { minPreferredAge: 18, maxPreferredAge: 100 },
      { maxDistanceKm: 4 },
      { maxDistanceKm: 1000 },
      { instagramTag: `@${"a".repeat(65)}` }
    ];
    for (const input of invalidInputs) {
      assert.equal((await invoke(input)).status, 400);
    }

    assert.equal((await invoke({
      minPreferredAge: 98,
      maxPreferredAge: 99,
      maxDistanceKm: 999,
      spotifyTag: `@${"s".repeat(64)}`
    })).status, 200);
  });
});

test("upsert rejects a spoofed authentication claim before any server-key row request", async () => {
  await withEnvironment(async () => {
    let requestCount = 0;
    globalThis.fetch = async (input) => {
      requestCount += 1;
      const url = new URL(String(input));
      assert.equal(url.pathname, "/v1/account");
      return jsonResponse(200, { $id: "user-a", email: "owner@example.com" });
    };

    const response = await invoke({ currentUserId: "victim" });
    assert.equal(response.status, 403);
    assert.equal(requestCount, 1);
  });
});

test("upsert refuses avatar files not owned by the authenticated user", async () => {
  await withEnvironment(async () => {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      if (url.pathname === "/v1/account") {
        return jsonResponse(200, { $id: "user-a", email: "owner@example.com" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(200, { $id: "user-a", userId: "user-a" });
      }
      if (method === "GET" && url.pathname.endsWith("/storage/buckets/avatars/files/avatar-1")) {
        return jsonResponse(200, { $id: "avatar-1", $permissions: ['read("users")'] });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const response = await invoke({ avatarFileId: "avatar-1" });
    assert.equal(response.status, 403);
  });
});

test("upsert replaces unsafe avatar permissions with an owner-only ACL", async () => {
  await withEnvironment(async () => {
    let fileUpdate = null;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      if (url.pathname === "/v1/account") {
        return jsonResponse(200, { $id: "user-a", email: "owner@example.com" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(200, { $id: "user-a", userId: "user-a" });
      }
      if (method === "GET" && url.pathname.endsWith("/storage/buckets/avatars/files/avatar-1")) {
        return jsonResponse(200, {
          $id: "avatar-1",
          name: "avatar.jpg",
          $permissions: [
            'read("any")',
            'update("user:user-a")',
            'delete("user:user-a")'
          ]
        });
      }
      if (method === "PUT" && url.pathname.endsWith("/storage/buckets/avatars/files/avatar-1")) {
        fileUpdate = JSON.parse(init.body);
        return jsonResponse(200, { $id: "avatar-1" });
      }
      if (method === "PATCH" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(200, { $id: "user-a" });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const response = await invoke({ avatarFileId: "avatar-1" });
    assert.equal(response.status, 200);
    assert.deepEqual(fileUpdate, {
      name: "avatar.jpg",
      permissions: [
        'read("user:user-a")',
        'update("user:user-a")',
        'delete("user:user-a")'
      ]
    });
  });
});

test("presence updates only server-generated timestamps on the authenticated profile", async () => {
  await withEnvironment(async () => {
    let updateBody = null;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      if (url.pathname === "/v1/account") {
        return jsonResponse(200, { $id: "user-a", email: "owner@example.com" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(200, { $id: "user-a", userId: "user-a" });
      }
      if (method === "PATCH" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        updateBody = JSON.parse(init.body);
        return jsonResponse(200, { $id: "user-a" });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const response = await invoke({ action: "presence", online: false, lastSeenAt: "2000-01-01" });
    assert.equal(response.status, 200);
    assert.equal(updateBody.data.presenceUpdatedAt, updateBody.data.lastSeenAt);
    assert.notEqual(updateBody.data.lastSeenAt, "2000-01-01");
    assert.deepEqual(updateBody.permissions, ['read("user:user-a")']);
  });
});

async function invoke(body) {
  let payload;
  let status;
  await manageProfile({
    req: {
      bodyJson: body,
      headers: {
        "x-appwrite-key": "server-key",
        "x-appwrite-user-jwt": "valid-jwt"
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
