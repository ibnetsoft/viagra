import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
test("worker transport handles success, gone devices, retries, max attempts and cancelled subscriptions", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/helpers/push-worker-case.ts",
    ],
    { timeout: 30000 },
  );
  assert.match(stdout, /worker transport outcomes verified/);
});
