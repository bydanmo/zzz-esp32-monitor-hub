/** Run after `npm run build`; uses an isolated copy of the Hub, never apps/hub/data. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scratchRoot = path.join(root, ".runtime", "tests");
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(path.join(scratchRoot, "hub-http-"));
const hub = path.join(scratch, "apps", "hub");
let child;

try {
  await cp(path.join(root, "apps", "hub", "dist"), path.join(hub, "dist"), { recursive: true });
  const web = path.join(scratch, "apps", "web", "dist");
  await mkdir(web, { recursive: true });
  await writeFile(path.join(web, "index.html"), "<!doctype html><title>Hub test</title>");

  child = spawn(process.execPath, ["dist/index.js"], {
    cwd: hub,
    env: { ...process.env, HUB_HOST: "127.0.0.1", HUB_PORT: "0", SYSTEM_REFRESH_MS: "60000" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const consume = chunk => { output += chunk.toString(); };
  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  const deadline = Date.now() + 15_000;
  let url;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Hub exited before listening: ${output.slice(-1000)}`);
    const match = output.match(/Server listening at http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) { url = `http://127.0.0.1:${match[1]}`; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!url) throw new Error(`Hub did not listen: ${output.slice(-1000)}`);
  assert.equal((await (await fetch(`${url}/api/health`)).json()).ok, true);

  let finalResponse;
  const targets = Array.from({ length: 20 }, (_, i) =>
    `2027-12-${String(i + 1).padStart(2, "0")}T09:00:00+08:00`);
  await Promise.all(targets.map(async examAt => {
    const response = await fetch(`${url}/api/exam-target`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ examAt })
    });
    assert.equal(response.status, 200, `concurrent write failed for ${examAt}`);
    const body = await response.json();
    assert.equal(body.target.examAt, examAt, "write receipt was overwritten by another request");
    finalResponse = body;
  }));
  const current = await (await fetch(`${url}/api/exam-target`)).json();
  const stored = JSON.parse(await readFile(path.join(hub, "data", "exam-target.json"), "utf8"));
  assert.deepEqual(current.target, stored);
  assert.deepEqual(current.target, finalResponse.target);

  const invalid = await fetch(`${url}/api/exam-target`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ examAt: "2027-02-30T09:00:00+08:00" })
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual((await (await fetch(`${url}/api/exam-target`)).json()).target, stored);
  process.stdout.write("Isolated Hub: health, 20 concurrent writes, persistence and invalid date passed.\n");
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => {
      child.once("close", resolve);
      setTimeout(resolve, 3000).unref();
    });
  }
  const resolvedRoot = path.resolve(scratchRoot) + path.sep;
  if (!path.resolve(scratch).startsWith(resolvedRoot)) throw new Error("Refusing to remove outside test directory");
  // Windows may briefly retain a just-closed file handle in this directory.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rm(scratch, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 9 || !["ENOTEMPTY", "EPERM", "EBUSY"].includes(error?.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
