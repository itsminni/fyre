import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateEntry,
  dedupeRowsById,
  discoverName,
  isProfileReady,
  makeUserContext
} from "./main.js";
import handler from "./main.js";

const ENVIRONMENT = {
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "database",
  APPWRITE_PROFILES_TABLE_ID: "profiles",
  APPWRITE_SWIPES_TABLE_ID: "swipes",
  APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships",
  APPWRITE_AVATARS_BUCKET_ID: "avatars",
  APPWRITE_AVATAR_TOKEN_TTL_SECONDS: "300"
};

test("dedupeRowsById removes duplicates returned by chunked exact-key queries", () => {
  const rows = [
    { $id: "rel-1", userAId: "a", userBId: "b" },
    { $id: "rel-1", userAId: "a", userBId: "b" },
    { $id: "rel-2", userAId: "a", userBId: "c" }
  ];

  assert.deepEqual(
    dedupeRowsById(rows).map((row) => row.$id),
    ["rel-1", "rel-2"]
  );
});

test("isProfileReady accepts complete profiles without coordinates", () => {
  assert.equal(isProfileReady({
    firstName: "Giulia",
    city: "Roma",
    gender: "female",
    orientation: "bisexual",
    birthDate: "1995-04-20T00:00:00.000Z",
    bio: "Ciao",
    preferredGenders: ["male"]
  }), true);
  assert.equal(isProfileReady({
    firstName: "Giulia",
    city: "Roma",
    gender: "female",
    birthDate: "1995-04-20T00:00:00.000Z",
    bio: "Ciao",
    preferredGenders: ["male"]
  }), false);
  assert.equal(isProfileReady({
    firstName: "Giulia",
    city: "Roma",
    gender: "female",
    orientation: "bisexual",
    birthDate: "1995-04-20T00:00:00.000Z",
    bio: "Ciao",
    preferredGenders: []
  }), false);
  assert.equal(isProfileReady({
    firstName: "Giulia",
    city: "Roma",
    gender: "female",
    orientation: "bisexual",
    birthDate: "1995-04-20T00:00:00.000Z",
    bio: "Ciao",
    preferredGenders: "male"
  }), false);
  assert.equal(isProfileReady({
    firstName: "Giulia",
    city: "Roma",
    gender: "female",
    orientation: "bisexual",
    birthDate: "1970-01-01T00:00:00.000Z",
    bio: "Ciao",
    preferredGenders: ["male"]
  }), true);
  assert.equal(isProfileReady({
    firstName: "Giulia",
    city: "Roma",
    gender: "female",
    orientation: "bisexual",
    birthDate: "not-a-date",
    bio: "Ciao",
    preferredGenders: ["male"]
  }), false);
});

test("makeUserContext clamps stored discovery preferences to canonical ranges", () => {
  assert.deepEqual(
    pickPreferences(makeUserContext({
      minPreferredAge: 1,
      maxPreferredAge: 1,
      maxDistanceKm: 1
    })),
    { minAge: 18, maxAge: 19, maxDistanceKm: 5 }
  );
  assert.deepEqual(
    pickPreferences(makeUserContext({
      minPreferredAge: 120,
      maxPreferredAge: 120,
      maxDistanceKm: 20_000
    })),
    { minAge: 98, maxAge: 99, maxDistanceKm: 999 }
  );
  assert.equal(makeUserContext({ maxDistanceKm: 0 }).maxDistanceKm, null);
});

test("client-controlled readiness flags and email addresses cannot bypass validation or become display names", () => {
  assert.equal(isProfileReady({
    profileReady: true,
    email: "private@example.test"
  }), false);
  assert.equal(discoverName({ email: "private@example.test" }), "Fyre");
});

test("buildCandidateEntry keeps eligible candidates when distance is unavailable", () => {
  const currentUser = {
    gender: "male",
    age: 31,
    city: "roma",
    interests: [],
    preferredGenders: ["female"],
    minAge: 18,
    maxAge: 45,
    maxDistanceKm: 50,
    latitude: 41.9028,
    longitude: 12.4964
  };

  const entry = buildCandidateEntry({
    userId: "candidate-1",
    firstName: "Giulia",
    city: "Milano",
    gender: "female",
    orientation: "bisexual",
    birthDate: "1995-04-20T00:00:00.000Z",
    preferredGenders: ["male"],
    minPreferredAge: 18,
    maxPreferredAge: 45,
    maxDistanceKm: 25,
    bio: "Ciao"
  }, "current-user", currentUser, new Set());

  assert.equal(entry?.distanceKm, null);
  assert.equal(entry?.candidate.gender, "female");
});

test("discovery scans a bounded stable cursor window and queries exclusions only for that window", async () => {
  await withEnvironment(async () => {
    const currentProfile = {
      $id: "user-a",
      userId: "user-a",
      firstName: "Ada",
      city: "Roma",
      gender: "male",
      birthDate: "1990-01-01T00:00:00.000Z",
      bio: "Ciao",
      preferredGenders: ["female"],
      minPreferredAge: 18,
      maxPreferredAge: 99,
      intent: "relationship",
      interests: "special"
    };
    const candidates = Array.from({ length: 402 }, (_, index) => {
      const suffix = String(index).padStart(3, "0");
      return {
        $id: `candidate-${suffix}`,
        userId: `candidate-${suffix}`,
        firstName: `Candidate ${suffix}`,
        city: "Roma",
        gender: "female",
        orientation: "bisexual",
        birthDate: "1995-01-01T00:00:00.000Z",
        bio: "Ciao",
        preferredGenders: ["male"],
        minPreferredAge: 18,
        maxPreferredAge: 99,
        intent: "friendship",
        interests: index === 5 || index === 6 ? "special" : null
      };
    });
    const requests = [];

    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      const method = options.method ?? "GET";
      const items = url.searchParams.getAll("queries[]").map((value) => JSON.parse(value));
      requests.push({ path: url.pathname, method, queries: items });

      if (url.pathname === "/v1/account") {
        return jsonResponse(200, { $id: "user-a" });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(200, currentProfile);
      }
      if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows")) {
        const cursor = findQuery(items, "cursorAfter")?.values?.[0] ?? null;
        const requestedLimit = findQuery(items, "limit")?.values?.[0] ?? 25;
        const start = cursor
          ? candidates.findIndex((row) => row.$id === cursor) + 1
          : 0;
        return jsonResponse(200, { rows: candidates.slice(start, start + requestedLimit) });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/swipes/rows")) {
        const keys = findQuery(items, "equal", "swipeKey")?.values ?? [];
        return jsonResponse(200, { rows: keys.includes("user-a:candidate-005")
          ? [{ $id: "swipe-005", swipeKey: "user-a:candidate-005", fromUserId: "user-a", toUserId: "candidate-005" }]
          : [] });
      }
      if (method === "GET" && url.pathname.endsWith("/tables/relationships/rows")) {
        const keys = findQuery(items, "equal", "pairKey")?.values ?? [];
        return jsonResponse(200, { rows: keys.includes("candidate-006:user-a")
          ? [{
              $id: "relationship-006",
              pairKey: "candidate-006:user-a",
              userAId: "candidate-006",
              userBId: "user-a",
              userAState: "blocked",
              userBState: "none"
            }]
          : [] });
      }
      return jsonResponse(500, { message: `Unexpected ${method} ${url.pathname}` });
    };

    const first = await invoke({ currentUserId: "user-a" });
    const firstRequestCount = requests.length;
    const second = await invoke({
      currentUserId: "user-a",
      profileCursor: first.payload.nextCursor
    });

    assert.equal(first.status, 200);
    assert.equal(first.payload.nextCursor, "candidate-399");
    assert.equal(first.payload.profiles.length, 40);
    assert.equal(first.payload.profiles.every((profile) => profile.intent === "friendship"), true);
    assert.equal(first.payload.profiles.some((profile) => profile.id === "candidate-005"), false);
    assert.equal(first.payload.profiles.some((profile) => profile.id === "candidate-006"), false);
    assert.equal(second.status, 200);
    assert.equal(second.payload.nextCursor, null);
    assert.equal(second.payload.profiles.length, 2);

    const firstCallRequests = requests.slice(0, firstRequestCount);
    const profileLists = firstCallRequests.filter((request) => request.path.endsWith("/tables/profiles/rows"));
    const exclusionLists = firstCallRequests.filter((request) => (
      request.path.endsWith("/tables/swipes/rows")
      || request.path.endsWith("/tables/relationships/rows")
    ));
    assert.equal(profileLists.length, 5);
    assert.equal(Math.max(...profileLists.map((request) => findQuery(request.queries, "limit")?.values?.[0] ?? 0)), 100);
    assert.equal(profileLists.every((request) => findQuery(request.queries, "orderAsc", "$id")), true);
    assert.equal(profileLists.every((request) => !findQuery(request.queries, "offset")), true);
    assert.deepEqual(findQuery(profileLists[1].queries, "cursorAfter")?.values, ["candidate-099"]);
    assert.equal(exclusionLists.length, 8);
    assert.equal(exclusionLists.every((request) => !findQuery(request.queries, "equal", "fromUserId")), true);
    assert.equal(exclusionLists.every((request) => !findQuery(request.queries, "equal", "userAId")), true);
    assert.equal(exclusionLists.every((request) => !findQuery(request.queries, "equal", "userBId")), true);
  });
});

test("discovery rejects an invalid profile cursor before scanning profile rows", async () => {
  await withEnvironment(async () => {
    let profileListRequests = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/account") return jsonResponse(200, { $id: "user-a" });
      if (url.pathname.endsWith("/tables/profiles/rows/user-a")) {
        return jsonResponse(200, {
          $id: "user-a",
          userId: "user-a",
          firstName: "Ada",
          city: "Roma",
          gender: "male",
          birthDate: "1990-01-01T00:00:00.000Z",
          bio: "Ciao"
        });
      }
      if (url.pathname.endsWith("/tables/profiles/rows")) profileListRequests += 1;
      return jsonResponse(500, {});
    };

    const response = await invoke({ profileCursor: "../invalid" });

    assert.equal(response.status, 400);
    assert.equal(profileListRequests, 0);
  });
});

test("eligible discovery returns only a short-lived token URL and never logs its secret", async () => {
  await withEnvironment(async () => {
    const requests = [];
    const logs = [];
    console.log = (value) => logs.push(String(value));
    globalThis.fetch = discoveryFetch({
      requests,
      candidateAvatarFileId: "avatar-eligible",
      tokenSecret: "discovery-token-secret"
    });

    const response = await invoke({ currentUserId: "user-a" });

    assert.equal(response.status, 200);
    assert.equal(response.payload.profiles.length, 1);
    const profile = response.payload.profiles[0];
    const expectedUrl = "https://appwrite.test/v1/storage/buckets/avatars/files/avatar-eligible/view?project=project&token=discovery-token-secret";
    assert.equal(profile.imageUrl, expectedUrl);
    assert.deepEqual(profile.photos, [expectedUrl]);
    assert.equal(profile.instagramTag, "beaprofile");
    assert.equal(profile.spotifyTag, "beamix");
    assert.equal("avatarFileId" in profile, false);
    assert.equal("photoFileIds" in profile, false);

    const tokenRequestIndex = requests.findIndex((request) => request.path.includes("/tokens/"));
    const tokenRequest = requests[tokenRequestIndex];
    const lastAuthorizationReadIndex = requests.reduce(
      (latest, request, index) => request.path.includes("/tables/") ? index : latest,
      -1
    );
    assert.ok(tokenRequestIndex > lastAuthorizationReadIndex);
    assert.equal(typeof tokenRequest.body.expire, "string");
    assert.ok(Date.parse(tokenRequest.body.expire) > Date.now());
    assert.equal(logs.join("\n").includes("discovery-token-secret"), false);
  });
});

test("blocked discovery candidates never cause token creation", async () => {
  await withEnvironment(async () => {
    const requests = [];
    globalThis.fetch = discoveryFetch({
      requests,
      candidateAvatarFileId: "avatar-blocked",
      relationship: {
        $id: "relationship-blocked",
        userAId: "user-a",
        userBId: "user-b",
        userAState: "none",
        userBState: "blocked"
      }
    });

    const response = await invoke({ currentUserId: "user-a" });

    assert.equal(response.status, 200);
    assert.deepEqual(response.payload.profiles, []);
    assert.equal(requests.some((request) => request.path.includes("/tokens/")), false);
  });
});

test("a token-service failure cannot fall back to raw avatar identifiers", async () => {
  await withEnvironment(async () => {
    const requests = [];
    globalThis.fetch = discoveryFetch({
      requests,
      candidateAvatarFileId: "avatar-token-failure",
      tokenFailure: true
    });

    const response = await invoke({ currentUserId: "user-a" });

    assert.equal(response.status, 200);
    assert.equal(response.payload.profiles.length, 1);
    assert.deepEqual(response.payload.profiles[0].photos, []);
    assert.equal(response.payload.profiles[0].imageUrl, undefined);
    assert.equal(JSON.stringify(response.payload).includes("avatar-token-failure"), false);
  });
});

function discoveryFetch({ requests, candidateAvatarFileId, relationship = null, tokenSecret = null, tokenFailure = false }) {
  const currentProfile = {
    $id: "user-a",
    userId: "user-a",
    firstName: "Ada",
    city: "Roma",
    gender: "male",
    orientation: "straight",
    birthDate: "1990-01-01T00:00:00.000Z",
    bio: "Ciao",
    preferredGenders: ["female"],
    minPreferredAge: 18,
    maxPreferredAge: 99
  };
  const candidateProfile = {
    $id: "user-b",
    userId: "user-b",
    firstName: "Bea",
    city: "Roma",
    gender: "female",
    orientation: "straight",
    birthDate: "1995-01-01T00:00:00.000Z",
    bio: "Ciao",
    preferredGenders: ["male"],
    minPreferredAge: 18,
    maxPreferredAge: 99,
    instagramTag: " @ bea profile ",
    spotifyTag: " @ bea mix ",
    avatarFileId: candidateAvatarFileId
  };

  return async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    requests.push({
      method,
      path: url.pathname,
      body: options.body ? JSON.parse(options.body) : null
    });
    if (url.pathname === "/v1/account") {
      return jsonResponse(200, { $id: "user-a" });
    }
    if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows/user-a")) {
      return jsonResponse(200, currentProfile);
    }
    if (method === "GET" && url.pathname.endsWith("/tables/profiles/rows")) {
      return jsonResponse(200, { rows: [currentProfile, candidateProfile] });
    }
    if (method === "GET" && url.pathname.endsWith("/tables/relationships/rows")) {
      return jsonResponse(200, { rows: relationship ? [relationship] : [] });
    }
    if (method === "GET" && url.pathname.endsWith("/rows")) {
      return jsonResponse(200, { rows: [] });
    }
    if (method === "POST" && url.pathname.endsWith(`/tokens/buckets/avatars/files/${candidateAvatarFileId}`)) {
      return tokenFailure
        ? jsonResponse(503, { message: "Unavailable" })
        : jsonResponse(201, { secret: tokenSecret, expire: "2099-01-01T00:00:00.000Z" });
    }
    return jsonResponse(500, { message: `Unexpected ${method} ${url.pathname}` });
  };
}

function pickPreferences(context) {
  return {
    minAge: context.minAge,
    maxAge: context.maxAge,
    maxDistanceKm: context.maxDistanceKm
  };
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
      json(payload, status = 200) {
        return { payload, status };
      }
    },
    error() {}
  });
}

async function withEnvironment(callback) {
  const originalEnvironment = Object.fromEntries(
    Object.keys(ENVIRONMENT).map((key) => [key, process.env[key]])
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

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function findQuery(items, method, attribute = undefined) {
  return items.find((item) => (
    item.method === method && (attribute === undefined || item.attribute === attribute)
  ));
}
