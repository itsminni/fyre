import test from "node:test";
import assert from "node:assert/strict";
import { monitoredCleanup } from "./cleanupHealth.js";

const config = { databaseId: "db", cleanupHealthTableId: "health" };
const summary = { checked: 2, discarded: 1, referenced: 1, deferred: 0, failed: 0 };
test("monitoring persists private counters with an explicit backlog signal", async () => {
  const calls = [];
  await monitoredCleanup(config, async (...args) => { calls.push(args); }, async report => {
    report({ due: 42, unscheduled: 0, batchLimitReached: true, deadlineReached: false }); return summary;
  });
  assert.deepEqual(calls[0][3].permissions, []);
  assert.equal(calls[0][3].data.state, "running");
  assert.equal(calls[1][3].data.state, "attention");
  assert.equal(JSON.parse(calls[1][3].data.summary).due, 42);
});
test("unexpected sweep failures leave a persisted error with partial counters", async () => {
  const calls = [];
  await assert.rejects(monitoredCleanup(config, async (...args) => { calls.push(args); }, async report => {
    report({ checked: 1 }); throw new Error("Private error details");
  }));
  const failure = calls.at(-1)[3].data;
  assert.equal(failure.state, "error"); assert.deepEqual(JSON.parse(failure.summary), { checked: 1 });
  assert.ok(!JSON.stringify(calls).includes("Private error details"));
});
test("failure to establish monitoring prevents an unobserved sweep", async () => {
  let ran = false;
  await assert.rejects(monitoredCleanup(config, async () => { throw new Error("offline"); }, async () => { ran = true; }));
  assert.equal(ran, false);
});
test("a lost final status write leaves the run detectable as an error", async () => {
  const calls = [];
  await assert.rejects(monitoredCleanup(config, async (...args) => {
    calls.push(args); if (args[3]?.data?.state === "healthy") throw new Error("timeout");
  }, async () => summary));
  assert.equal(calls.at(-1)[3].data.state, "error");
});
