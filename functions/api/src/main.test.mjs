import test from "node:test";
import assert from "node:assert/strict";
import api, { dispatch } from "./main.js";
import { validateAvatarFile } from "../../sendmessage/src/profile.js";

const res = { json: (body, status) => ({ body, status }) };
test("router preserves trusted headers and nested actions without allowing payload header overrides", async () => {
  const headers = { "x-appwrite-key": "runtime", "x-appwrite-user-jwt": "jwt" };
  const payload = { action: "reserveUpload", headers: { "x-appwrite-key": "spoof" } };
  const routes = new Map([["manageprofile", context => context.req]]);
  const req = await dispatch({ req: { headers, bodyText: JSON.stringify({ operation: "manageprofile", payload }) }, res }, routes);
  assert.deepEqual(req.bodyJson, payload);
  assert.deepEqual(JSON.parse(req.bodyText), payload);
  assert.equal(req.headers, headers);
});
test("router rejects invalid envelopes, prototype names and scheduled cleanup", async () => {
  for (const bodyText of ["{", "[]", "null", '{"operation":"sendmessage","payload":[]}']) {
    assert.equal((await api({ req: { bodyText }, res })).status, 400);
  }
  for (const operation of ["cleanupattachments", "constructor", "__proto__", "missing"]) {
    assert.equal((await api({ req: { bodyJson: { operation, payload: {} } }, res })).status, 404);
  }
});
test("every public operation keeps its handler's authentication gate", async () => {
  const keys = ["APPWRITE_FUNCTION_API_ENDPOINT", "APPWRITE_FUNCTION_PROJECT_ID", "APPWRITE_DATABASE_ID",
    "APPWRITE_PROFILES_TABLE_ID", "APPWRITE_EVENTS_TABLE_ID", "APPWRITE_EVENT_REGISTRATIONS_TABLE_ID",
    "APPWRITE_THREADS_TABLE_ID", "APPWRITE_THREAD_PARTICIPANTS_TABLE_ID", "APPWRITE_MESSAGES_TABLE_ID",
    "APPWRITE_SWIPES_TABLE_ID", "APPWRITE_MATCHES_TABLE_ID", "APPWRITE_RELATIONSHIPS_TABLE_ID",
    "APPWRITE_AVATARS_BUCKET_ID", "APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID"];
  keys.push("APPWRITE_AVATAR_TOKEN_TTL_SECONDS");
  const previous = { ...process.env };
  try {
    for (const key of keys) process.env[key] = "resource";
    process.env.APPWRITE_AVATAR_TOKEN_TTL_SECONDS = "300";
    process.env.APPWRITE_FUNCTION_API_ENDPOINT = "https://appwrite.test/v1";
    for (const operation of ["manageprofile", "sendmessage", "discoverprofiles", "recordswipe",
      "createorgetthread", "managerelationship", "registerforevent", "canceleventregistration", "manageeventadmin"]) {
      const result = await api({ req: { headers: { "x-appwrite-key": "runtime" }, bodyJson: { operation, payload: {} } }, res, error() {} });
      assert.equal(result.status, 401, operation);
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
test("shared bucket still restricts avatars to complete images of 10 MiB", () => {
  const image = { name: "photo.jpg", mimeType: "image/jpeg", sizeOriginal: 10 * 1024 * 1024 };
  assert.doesNotThrow(() => validateAvatarFile(image));
  for (const file of [{ ...image, sizeOriginal: image.sizeOriginal + 1 }, { ...image, sizeOriginal: 0 },
    { ...image, name: "photo.pdf", mimeType: "application/pdf" }, { ...image, mimeType: "video/mp4" },
    { ...image, chunksTotal: 2, chunksUploaded: 1 }, { ...image, name: "photo.constructor" }]) {
    assert.throws(() => validateAvatarFile(file), error => error.statusCode === 400);
  }
});
