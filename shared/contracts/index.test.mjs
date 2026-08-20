import test from "node:test";
import assert from "node:assert/strict";

import {
  MATCH_INTENTS,
  makeChatMessageContract,
  makeDiscoverProfileContract,
  normalizeMatchIntent,
  parseDiscoverProfilesPayload,
  seededIntegerFromString
} from "./index.js";

test("makeDiscoverProfileContract normalizes rich payloads", () => {
  const profile = makeDiscoverProfileContract({
    id: "user_123",
    name: "Alex",
    age: 29,
    gender: "nonbinary",
    intent: "relationship",
    bio: "Ciao",
    instagramTag: " @ alex gram ",
    spotifyTag: `@${"s".repeat(70)}`,
    photos: ["https://cdn.example.test/a.jpg"],
    photoFileIds: ["must-not-cross-the-boundary"],
    avatarFileId: "must-not-cross-the-boundary",
    compatibilityScore: 88,
    distance: 14,
    commonInterests: ["music", "travel"],
    relationshipState: "matched"
  });

  assert.deepEqual(profile, {
    id: "user_123",
    name: "Alex",
    age: 29,
    gender: "nonBinary",
    city: undefined,
    intent: "relationship",
    bio: "Ciao",
    instagramTag: "alexgram",
    spotifyTag: "s".repeat(64),
    imageUrl: "https://cdn.example.test/a.jpg",
    photos: ["https://cdn.example.test/a.jpg"],
    compatibilityScore: 88,
    distanceKm: 14,
    distance: 14,
    commonInterests: ["music", "travel"],
    relationshipState: "matched"
  });
  assert.equal("photoFileIds" in profile, false);
  assert.equal("avatarFileId" in profile, false);
});

test("parseDiscoverProfilesPayload keeps optional normalized social tags", () => {
  const [profile] = parseDiscoverProfilesPayload([{
    id: "user_456",
    name: "Bea",
    instagramTag: " @ bea profile ",
    spotifyTag: null
  }]);

  assert.equal(profile.instagramTag, "beaprofile");
  assert.equal(profile.spotifyTag, undefined);
  assert.deepEqual(MATCH_INTENTS, ["relationship", "friendship", "casual", "notSure"]);
  assert.equal(normalizeMatchIntent("unsupported"), undefined);
});

test("makeChatMessageContract normalizes function payloads", () => {
  const message = makeChatMessageContract({
    messageId: "msg_1",
    text: "Hello",
    messageType: "image",
    attachmentFileId: "file_1",
    createdAt: "2026-04-23T10:00:00.000Z"
  });

  assert.equal(message?.messageId, "msg_1");
  assert.equal(message?.messageType, "image");
  assert.equal(message?.createdAt, "2026-04-23T10:00:00.000Z");
});

test("seededIntegerFromString is deterministic", () => {
  const first = seededIntegerFromString("user_123", 2, 7);
  const second = seededIntegerFromString("user_123", 2, 7);

  assert.equal(first, second);
  assert.ok(first >= 2 && first <= 7);
});
