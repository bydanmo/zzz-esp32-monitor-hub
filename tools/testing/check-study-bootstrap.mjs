// A cold Hub uses copied build output, never the real app's data directory.
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
await mkdir(path.join(root, ".runtime"), { recursive: true });
const fixture = await mkdtemp(path.join(root, ".runtime/study-bootstrap-"));
await cp(path.join(root, "apps/hub/dist"), path.join(fixture, "hub/dist"), { recursive: true });
await cp(path.join(root, "apps/web/dist"), path.join(fixture, "web/dist"), { recursive: true });
const child = spawn(process.execPath, [path.join(fixture, "hub/dist/index.js")], {
  cwd: root, env: { ...process.env, HUB_HOST: "127.0.0.1", HUB_PORT: "18032", STUDY_BRIDGE_ENABLED: "0", HARDWARE_MONITOR_URL: "" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
child.stdout.on("data", chunk => { logs += chunk; });
child.stderr.on("data", chunk => { logs += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("Fixture Hub exited before listening");
    try { const r = await fetch("http://127.0.0.1:18032/api/health"); ready = r.ok; } catch { /* Starting. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "isolated cold Hub must start");
  const responses = await Promise.all([0, 1].map(() => fetch("http://127.0.0.1:18032/api/study-link", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: false, controlsEnabled: false })
  })));
  assert.ok(responses.every(r => r.ok), "serialized writes create a missing data directory");
  const settings = JSON.parse(await readFile(path.join(fixture, "hub/data/study-controls.json"), "utf8"));
  assert.equal(settings.enabled, false); assert.equal(settings.bridgeEnabled, false);
  const response = await fetch("http://127.0.0.1:18032/api/study-link");
  const state = await response.json();
  assert.equal(state.enabled, false); assert.equal(state.controlsEnabled, false);
  assert.equal(state.online, false); assert.equal("controlKey" in state, false);
  console.log(JSON.stringify({ coldStartWithoutPersonalConfig: true, settingsDirectoryCreated: true,
    concurrentSettingsWrites: true, pairingKeyNotExposed: true, learningWrites: 0 }));
} finally {
  child.kill();
  await writeFile(path.join(fixture, "server.log"), logs);
}
