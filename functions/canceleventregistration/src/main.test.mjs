import test from "node:test";
import assert from "node:assert/strict";

import { selectPromotionCandidate } from "./main.js";

test("selectPromotionCandidate picks the oldest waitlisted registration of the same gender", () => {
  const registrations = [
    {
      $id: "wait-f-newer",
      status: "waitlisted",
      gender: "female",
      createdAt: "2026-04-20T12:00:00.000Z"
    },
    {
      $id: "wait-m-older",
      status: "waitlisted",
      gender: "male",
      createdAt: "2026-04-20T09:00:00.000Z"
    },
    {
      $id: "wait-m-oldest",
      status: "waitlisted",
      gender: "male",
      createdAt: "2026-04-20T08:00:00.000Z"
    }
  ];

  const candidate = selectPromotionCandidate(registrations, {
    gender: "male"
  });

  assert.equal(candidate?.$id, "wait-m-oldest");
});
