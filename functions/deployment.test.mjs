import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

function deploy({ mode = "28", remote = "project", failSend = false, selected = [], checkInput = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "fyre-deploy-test-"));
  const ruby = execFileSync("ruby", ["-e", "print RbConfig.ruby"], { encoding: "utf8" });
  try {
    for (const dir of ["scripts", "appwrite", "bin"]) mkdirSync(join(root, dir));
    copyFileSync(new URL("../scripts/deploy-appwrite-functions.sh", import.meta.url), join(root, "scripts/deploy-appwrite-functions.sh"));
    writeFileSync(join(root, ".env"), "fixture=1\n");
    writeFileSync(join(root, "appwrite.config.json"), JSON.stringify({ projectId: "project" }));
    writeFileSync(join(root, "appwrite/functions.local.json"), JSON.stringify([{ $id: "sendmessage" }, { $id: "cleanupattachments" }]));
    const executable = (name, source) => writeFileSync(join(root, "bin", name), "#!/usr/bin/env node\n" + source, { mode: 0o700 });
    executable("npm", "process.exit(0)");
    executable("ruby", `const {spawnSync}=require('node:child_process');
      const args=process.argv.slice(2);
      if(args[0].startsWith('scripts/')) process.exit(0);
      const r=spawnSync(${JSON.stringify(ruby)},args,{stdio:'inherit'});process.exit(r.status??1);`);
    executable("appwrite", `const fs=require('node:fs');const a=process.argv.slice(2);
      if(a[0]==='whoami')process.exit(0);
      if(a[0]==='project'){console.log(JSON.stringify({$id:process.env.TEST_REMOTE}));process.exit(0);}
      if(a.includes('--help')){console.log(process.env.TEST_MODE==='28'?'--function-id':'--all');process.exit(0);}
      if(process.env.TEST_INPUT==='1'&&fs.readFileSync(0,'utf8')!=='operator-input\\n')process.exit(2);
      fs.appendFileSync('calls.jsonl',JSON.stringify(a)+'\\n');
      if(process.env.TEST_FAIL==='1'&&a.includes('sendmessage'))process.exit(1);`);
    const result = spawnSync("/bin/bash", [join(root, "scripts/deploy-appwrite-functions.sh"), "--confirm-project", "project", ...selected.flatMap(id => ["--function-id", id])], {
      cwd: root, encoding: "utf8", input: "operator-input\n", env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, TEST_MODE: mode, TEST_INPUT: checkInput ? "1" : "0", TEST_REMOTE: remote, TEST_FAIL: failSend ? "1" : "0" }
    });
    let calls = [];
    try { calls = readFileSync(join(root, "calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse); } catch {}
    return { ...result, calls };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("CLI 28 deploys in manifest order without obsolete --all or implicit --force", () => {
  const result = deploy(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, ["sendmessage", "cleanupattachments"].map(id => ["push", "functions", "--function-id", id, "--with-variables", "--activate", "true"]));
});
test("older CLI retains --all compatibility", () => {
  const result = deploy({ mode: "25" }); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [["push", "functions", "--all", "--with-variables", "--activate", "true"]]);
});
test("remote project mismatch prevents deployment", () => {
  const result = deploy({ remote: "other" }); assert.notEqual(result.status, 0); assert.deepEqual(result.calls, []);
});
test("failed send deployment prevents activation of scheduled cleanup", () => {
  const result = deploy({ failSend: true }); assert.notEqual(result.status, 0); assert.equal(result.calls.length, 1);
  assert.ok(result.calls[0].includes("sendmessage"));
});

test("selected deployments follow manifest order and reject unknown IDs", () => {
  const selected = deploy({ selected: ["cleanupattachments"] });
  assert.equal(selected.status, 0, selected.stderr); assert.equal(selected.calls.length, 1);
  assert.ok(selected.calls[0].includes("cleanupattachments"));
  const invalid = deploy({ selected: ["missing"] });
  assert.notEqual(invalid.status, 0); assert.deepEqual(invalid.calls, []);
});

test("deployment preserves operator input instead of consuming the function list", () => {
  const result = deploy({ selected: ["sendmessage"], checkInput: true });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.calls.length, 1);
});
