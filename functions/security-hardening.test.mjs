import test from "node:test";
import assert from "node:assert/strict";

import cancelEventRegistration from "./canceleventregistration/src/main.js";
import createOrGetThread from "./createorgetthread/src/main.js";
import discoverProfiles from "./discoverprofiles/src/main.js";
import manageEventAdmin from "./manageeventadmin/src/main.js";
import manageProfile from "./manageprofile/src/main.js";
import manageRelationship from "./managerelationship/src/main.js";
import recordSwipe from "./recordswipe/src/main.js";
import registerForEvent, {
  appwriteIdentifier,
  pathSegment
} from "./registerforevent/src/main.js";
import sendMessage from "./sendmessage/src/main.js";

const HANDLERS = [
  ["canceleventregistration", cancelEventRegistration],
  ["createorgetthread", createOrGetThread],
  ["discoverprofiles", discoverProfiles],
  ["manageeventadmin", manageEventAdmin],
  ["manageprofile", manageProfile],
  ["managerelationship", manageRelationship],
  ["recordswipe", recordSwipe],
  ["registerforevent", registerForEvent],
  ["sendmessage", sendMessage]
];

const ENV = {
  APPWRITE_FUNCTION_API_ENDPOINT: "https://appwrite.test/v1",
  APPWRITE_FUNCTION_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "database",
  APPWRITE_PROFILES_TABLE_ID: "profiles",
  APPWRITE_EVENTS_TABLE_ID: "events",
  APPWRITE_EVENT_REGISTRATIONS_TABLE_ID: "eventregistrations",
  APPWRITE_THREADS_TABLE_ID: "threads",
  APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: "participants",
  APPWRITE_MESSAGES_TABLE_ID: "messages",
  APPWRITE_SWIPES_TABLE_ID: "swipes",
  APPWRITE_MATCHES_TABLE_ID: "matches",
  APPWRITE_RELATIONSHIPS_TABLE_ID: "relationships",
  APPWRITE_AVATARS_BUCKET_ID: "avatars",
  APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID: "chatattachments",
  APPWRITE_EVENT_ADMIN_USER_IDS: "authenticated-user",
  APPWRITE_AVATAR_TOKEN_TTL_SECONDS: "300"
};

test("Appwrite identifiers are canonical and dynamic URL segments are encoded", () => {
  assert.equal(appwriteIdentifier("event-1"), "event-1");
  assert.equal(appwriteIdentifier("profile.row_2"), "profile.row_2");
  for (const invalid of [
    "../account",
    "with/slash",
    ".leading",
    "contains space",
    "a".repeat(37),
    ""
  ]) {
    assert.equal(appwriteIdentifier(invalid), null, invalid);
  }
  assert.equal(pathSegment("../account"), "..%2Faccount");
  assert.equal(pathSegment("row?queries[]=all"), "row%3Fqueries%5B%5D%3Dall");
});

test("identifier traversal payloads are rejected before resource requests", async () => {
  await withEnvironment(async () => {
    const cases = [
      ["canceleventregistration", cancelEventRegistration, { eventId: "../account" }],
      ["createorgetthread", createOrGetThread, { otherUserId: "../account" }],
      ["manageeventadmin", manageEventAdmin, { eventId: "../account", action: "fetch" }],
      ["managerelationship", manageRelationship, { threadId: "../account", action: "block" }],
      ["recordswipe", recordSwipe, { otherUserId: "../account", decision: "liked" }],
      ["registerforevent", registerForEvent, { eventId: "../account" }],
      ["sendmessage", sendMessage, { threadId: "../account", text: "hello" }],
      ["sendmessage attachment", sendMessage, {
        threadId: "thread-1",
        attachmentFileId: "../account"
      }],
      ["sendmessage reply", sendMessage, {
        threadId: "thread-1",
        replyToMessageId: "../account",
        text: "hello"
      }]
    ];

    for (const [name, handler, body] of cases) {
      const resourcePaths = [];
      globalThis.fetch = async (url) => {
        const pathname = new URL(String(url)).pathname;
        if (pathname === "/v1/account") {
          return jsonResponse(200, {
            $id: "authenticated-user",
            email: "authenticated@example.test",
            emailVerification: true
          });
        }
        resourcePaths.push(pathname);
        return jsonResponse(500, { message: "unexpected resource request" });
      };

      const response = await invoke(handler, {
        currentUserId: "authenticated-user",
        ...body
      }, authenticatedHeaders());
      assert.equal(response.status, 400, name);
      assert.deepEqual(resourcePaths, [], name);
    }
  });
});

test("invalid Appwrite resource identifiers fail closed before fetch", async () => {
  await withEnvironment(async () => {
    process.env.APPWRITE_DATABASE_ID = "../database";
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return jsonResponse(500, { message: "must not be called" });
    };

    for (const [name, handler] of HANDLERS) {
      const response = await invoke(handler, {}, authenticatedHeaders());
      assert.equal(response.status, 500, name);
    }
    assert.equal(fetchCount, 0);
  });
});

test("malformed user identifiers returned by JWT verification are rejected", async () => {
  await withEnvironment(async () => {
    globalThis.fetch = async (url) => {
      assert.equal(new URL(String(url)).pathname, "/v1/account");
      return jsonResponse(200, {
        $id: "../account",
        email: "authenticated@example.test",
        emailVerification: true
      });
    };

    for (const [name, handler] of HANDLERS) {
      const response = await invoke(handler, {}, authenticatedHeaders());
      assert.equal(response.status, 401, name);
    }
  });
});

test("every user-facing function rejects a spoofed user id when JWT is missing", async () => {
  await withEnvironment(async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error("missing-JWT requests must not reach Appwrite");
    };

    for (const [name, handler] of HANDLERS) {
      const response = await invoke(handler, {
        currentUserId: "victim-user",
        eventId: "event-1"
      }, {
        "x-appwrite-key": "appwrite-injected-runtime-key",
        "x-appwrite-user-id": "victim-user"
      });
      assert.equal(response.status, 401, name);
    }
    assert.equal(fetchCount, 0);
  });
});

test("verified JWT identity wins over spoofed header and body claims", async () => {
  await withEnvironment(async () => {
    globalThis.fetch = async (url) => {
      assert.equal(new URL(String(url)).pathname, "/v1/account");
      return jsonResponse(200, { $id: "authenticated-user", email: "authenticated@example.test" });
    };

    for (const [name, handler] of HANDLERS) {
      const response = await invoke(handler, {
        currentUserId: "victim-user",
        eventId: "event-1"
      }, {
        "x-appwrite-key": "appwrite-injected-runtime-key",
        "x-appwrite-user-jwt": "valid-jwt",
        "x-appwrite-user-id": "victim-user"
      });
      assert.equal(response.status, 403, name);
    }
  });
});

test("every function accepts Appwrite's injected runtime key header", async () => {
  await withEnvironment(async () => {
    delete process.env.APPWRITE_FUNCTION_API_KEY;

    for (const [name, handler] of HANDLERS) {
      let accountFetchCount = 0;
      globalThis.fetch = async (url) => {
        if (new URL(String(url)).pathname === "/v1/account") {
          accountFetchCount += 1;
          return jsonResponse(200, {
            $id: "authenticated-user",
            email: "authenticated@example.test"
          });
        }
        return jsonResponse(404, { message: "not found" });
      };

      const response = await invoke(handler, {
        currentUserId: "authenticated-user",
        eventId: "event-1"
      }, {
        "x-appwrite-user-jwt": "valid-jwt",
        "x-appwrite-user-id": "authenticated-user",
        "x-appwrite-key": "appwrite-injected-runtime-key"
      });
      assert.equal(accountFetchCount, 1, `${name}: runtime header rejected before JWT verification`);
      assert.notEqual(response.status, null, name);
    }
  });
});

test("environment API key variables never substitute Appwrite's runtime key header", async () => {
  await withEnvironment(async () => {
    process.env.APPWRITE_FUNCTION_API_KEY = "unsupported-function-key";
    process.env.APPWRITE_API_KEY = "unsupported-custom-key";
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error("environment keys must fail before any backend request");
    };

    for (const [name, handler] of HANDLERS) {
      const response = await invoke(handler, {
        currentUserId: "attacker",
        eventId: "event-1"
      }, {
        "x-appwrite-user-jwt": "attacker-jwt"
      });
      assert.equal(response.status, 500, name);
    }
    assert.equal(fetchCount, 0);
    delete process.env.APPWRITE_API_KEY;
  });
});

async function invoke(handler, body, headers) {
  let payload = null;
  let status = null;
  await handler({
    req: { bodyJson: body, headers },
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

function authenticatedHeaders() {
  return {
    "x-appwrite-user-jwt": "valid-jwt",
    "x-appwrite-user-id": "authenticated-user",
    "x-appwrite-key": "appwrite-injected-runtime-key"
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

async function withEnvironment(run) {
  const originalFetch = globalThis.fetch;
  const environmentKeys = [...Object.keys(ENV), "APPWRITE_FUNCTION_API_KEY", "APPWRITE_API_KEY"];
  const snapshot = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
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
