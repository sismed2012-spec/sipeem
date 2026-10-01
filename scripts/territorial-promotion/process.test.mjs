import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { redactSensitiveText, runProcessOnce } from "./process.mjs";

const temporaryDirectories = [];

after(async () => {
  for (const directory of temporaryDirectories) {
    assert.ok(directory.startsWith(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("captures one successful or failed child process without throwing", async () => {
  const success = await runProcessOnce({
    command: process.execPath,
    args: ["-e", "process.stdout.write('ok')"],
  });
  assert.deepEqual(success, {
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    errorCode: null,
  });

  const failure = await runProcessOnce({
    command: process.execPath,
    args: ["-e", "process.stderr.write('bad'); process.exit(7)"],
  });
  assert.equal(failure.exitCode, 7);
  assert.equal(failure.stdout, "");
  assert.equal(failure.stderr, "bad");
  assert.equal(failure.errorCode, null);
});

test("returns a redacted spawn error for an unavailable executable", async () => {
  const result = await runProcessOnce({
    command: "definitely-not-a-real-sipeem-command",
    args: [],
  });

  assert.equal(result.exitCode, null);
  assert.equal(result.errorCode, "ENOENT");
  assert.doesNotMatch(result.stderr, /password|token|secret/i);
});

test("executes exactly once and passes shell metacharacters literally", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "promotion-process-"));
  temporaryDirectories.push(directory);
  const markerPath = path.join(directory, "marker.txt");
  const literal = "$(echo owned) & whoami; $env:USERNAME";

  const result = await runProcessOnce({
    command: process.execPath,
    args: [
      "-e",
      "require('node:fs').appendFileSync(process.argv[1], 'x'); process.stdout.write(process.argv[2])",
      markerPath,
      literal,
    ],
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, literal);
  assert.equal(await readFile(markerPath, "utf8"), "x");
});

test("passes stdin without echoing it and limits captured output", async () => {
  const stdin = "input-value-that-must-not-be-logged";
  const result = await runProcessOnce({
    command: process.execPath,
    args: [
      "-e",
      "process.stdin.resume(); process.stdin.on('data', () => process.stdout.write('x'.repeat(100)))",
    ],
    stdin,
    sensitiveValues: [stdin],
    maxOutputBytes: 32,
  });

  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /input-value/);
  assert.match(result.stdout, /output truncated/i);
  assert.ok(Buffer.byteLength(result.stdout) < 100);
});

test("redacts connection userinfo, passwords, JWTs, service keys, and supplied values", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
  const serviceKey = "sb_secret_example-value";
  const text = [
    "postgresql://postgres:supersecret@db.example.test/postgres",
    "password=hunter2",
    jwt,
    serviceKey,
    "custom=top-secret",
  ].join(" ");

  const redacted = redactSensitiveText(text, ["top-secret"]);

  for (const secret of ["supersecret", "hunter2", jwt, serviceKey, "top-secret"]) {
    assert.doesNotMatch(redacted, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(redacted, /\[REDACTED\]/);
});
