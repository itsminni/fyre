import test from "node:test";
import assert from "node:assert/strict";

import {
  makeChatMessageContract,
  makeDiscoverProfileContract,
  seededIntegerFromString
} from "./index.js";

test("makeDiscoverProfileContract normalizes rich payloads", () => {
  const profile = makeDiscoverProfileContract({
    id: "user_123",
    name: "Alex",
    age: 29,
    gender: "nonbinary",
    bio: "Ciao",
    photos: ["https://cdn.example.test/a.jpg"],
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
    intent: undefined,
    bio: "Ciao",
    imageUrl: "https://cdn.example.test/a.jpg",
    photos: ["https://cdn.example.test/a.jpg"],
    photoFileIds: [],
    avatarFileId: undefined,
    compatibilityScore: 88,
    distanceKm: 14,
    distance: 14,
    commonInterests: ["music", "travel"],
    relationshipState: "matched"
  });
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
