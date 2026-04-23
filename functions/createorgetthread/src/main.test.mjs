import test from "node:test";
import assert from "node:assert/strict";

import { sharedThreadIdFromParticipantRows } from "./main.js";

test("sharedThreadIdFromParticipantRows returns the common thread id", () => {
  const firstRows = [
    { threadId: "thread-a" },
    { threadId: "thread-b" },
    { threadId: "thread-c" }
  ];
  const secondRows = [
    { threadId: "thread-z" },
    { threadId: "thread-b" }
  ];

  assert.equal(sharedThreadIdFromParticipantRows(firstRows, secondRows), "thread-b");
});
