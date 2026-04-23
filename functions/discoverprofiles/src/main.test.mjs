import test from "node:test";
import assert from "node:assert/strict";

import { dedupeRowsById } from "./main.js";

test("dedupeRowsById removes duplicates produced by split relationship queries", () => {
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
