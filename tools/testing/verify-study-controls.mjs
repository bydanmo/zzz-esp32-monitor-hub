// Wire-format software device -> actual Hub bridge -> isolated PC HTTP API.
import assert from "node:assert/strict";
import { StudyBridge, validateStudySnapshot } from "../../apps/hub/dist/study-bridge.js";
const base = process.env.STUDY_TEST_URL;
const taskId = Number(process.env.STUDY_TEST_TASK);
if (!base?.startsWith("http://127.0.0.1:18031") || !Number.isSafeInteger(taskId)) throw new Error("Isolated fixture required");
async function request(path, body) {
  const r = await fetch(base + path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.ok(r.ok, `${path}: ${r.status}`); const text = await r.text(); return text ? JSON.parse(text) : {};
}
const read = () => request("/api/device/study");
const frames = [];
const socket = { readyState: 1, send: text => frames.push(JSON.parse(text)) };
let writes = 0;
const bridge = new StudyBridge(true, read, () => Date.now(), async (path, body) => { writes++; await request(path, body); });
bridge.setControlsEnabled(true); bridge.register(socket, true, true); await bridge.tick();
let sequence = 0;
async function action(action, duplicate = false) {
  await bridge.tick();
  const snapshot = validateStudySnapshot(await read());
  const index = snapshot.tasks.findIndex(t => t.id === taskId); assert.ok(index >= 0);
  bridge.handleMessage(socket, JSON.stringify({ type: "studyPage", page: Math.floor(index / 3) }));
  const header = frames.findLast(f => f.type === "study");
  const id = `isolated-${Date.now()}-${sequence++}`;
  const text = JSON.stringify({ type: "studyAction", version: 1, id, action, taskId, batch: header.batch });
  assert.ok(bridge.handleMessage(socket, text)); if (duplicate) bridge.handleMessage(socket, text);
  const deadline = Date.now() + 7000;
  while (!frames.some(f => f.type === "studyActionResult" && f.id === id) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  const receipt = frames.findLast(f => f.type === "studyActionResult" && f.id === id);
  assert.equal(receipt?.status, "ok", action);
  return read();
}
const before = writes;
assert.equal((await action("start", true)).session.status, "running");
assert.equal(writes, before + 1);
assert.equal((await action("pause")).session.status, "paused");
assert.equal((await action("resume")).session.status, "running");
assert.equal((await action("end")).session.status, "idle");
assert.ok((await action("done", true)).tasks.find(t => t.id === taskId).done);
assert.equal(writes, 5);
const logs = await request("/api/logs");
console.log(JSON.stringify({ transport: "software wire frames through real StudyBridge; real isolated PC HTTP",
  startPauseResumeEnd: true, completeConfirmed: true, duplicateSingleWrite: true,
  writes, framesWithinBudget: frames.every(f => Buffer.byteLength(JSON.stringify(f)) < 512), logs }));
