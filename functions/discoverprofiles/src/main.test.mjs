import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateEntry,
  dedupeRowsById,
  isProfileReady
} from "./main.js";

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

test("isProfileReady accepts complete profiles without coordinates", () => {
  assert.equal(isProfileReady({
    firstName: "Giulia",
    city: "Roma",
    gender: "female",
    birthDate: "1995-04-20T00:00:00.000Z",
    bio: "Ciao"
  }), true);
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
