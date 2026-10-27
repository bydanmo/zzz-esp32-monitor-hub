import assert from "node:assert/strict";
import test from "node:test";
import { StudyController, StudyHttpError } from "../apps/hub/src/study-control.ts";
import { StudyBridge, type StudySnapshot } from "../apps/hub/src/study-bridge.ts";
import { pairedStudyHello } from "../apps/hub/src/study-pairing.ts";

test("control pairing rejects missing, malformed and wrong keys without affecting display hello", () => {
  const key = "a".repeat(64);
  assert.equal(pairedStudyHello(JSON.stringify({ type: "hello", device: { controlKey: key } }), key), true);
  for (const raw of ["{}", "bad", JSON.stringify({ type: "hello", device: { controlKey: "b".repeat(64) } }), JSON.stringify({ type: "hello", device: { controlKey: "short" } })])
    assert.equal(pairedStudyHello(raw, key), false);
  assert.equal(pairedStudyHello(JSON.stringify({ type: "hello", device: { controlKey: key } }), ""), false);
});

const sample = (): StudySnapshot => ({ protocol: 2, date: "2026-10-26", total: 2, completed: 0,
  tasks: [{ id: 10, title: "测试任务", done: false, minutes: 150 }, { id: 11, title: "另一页", done: false, minutes: 60 }],
  session: { session_id: null, revision: 7, status: "idle", mode: "pomodoro", phase: "focus", elapsed_seconds: 0, remaining_seconds: 1500, task: null } });
const settle = () => new Promise(resolve => setTimeout(resolve, 10));

test("PC writes use the shown revision; completion never supplies planned or timer minutes", async () => {
  const current = sample(); const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const control = new StudyController(async () => current, async (path, body) => { writes.push({ path, body }); });
  assert.equal((await control.execute({ id: "one", action: "start", taskId: 10 }, structuredClone(current), [10])).status, "ok");
  assert.deepEqual(writes[0], { path: "/api/focus/action", body: { request_id: "esp32:one", revision: 7, action: "start", task_id: 10, mode: "pomodoro", phase: "focus", duration_seconds: 1500 } });
  current.session.status = "running";
  assert.equal((await control.execute({ id: "two", action: "pause" }, structuredClone(current), [10])).status, "ok");
  current.session.status = "paused";
  assert.equal((await control.execute({ id: "three", action: "resume" }, structuredClone(current), [10])).status, "ok");
  assert.equal((await control.execute({ id: "end", action: "end" }, structuredClone(current), [10])).status, "ok");
  assert.equal((await control.execute({ id: "four", action: "done", taskId: 10 }, current, [10])).status, "ok");
  assert.deepEqual(writes.at(-1), { path: "/api/tasks/10/done", body: {} });
  current.tasks[0].done = true;
  const count = writes.length;
  assert.equal((await control.execute({ id: "five", action: "done", taskId: 10 }, current, [10])).status, "ok");
  assert.equal(writes.length, count);
});

test("stale revisions, midnight, invisible tasks and invalid transitions never write", async () => {
  const current = sample(); const shown = structuredClone(current); let writes = 0;
  const control = new StudyController(async () => current, async () => { writes++; });
  current.session.revision++;
  assert.equal((await control.execute({ id: "stale", action: "start", taskId: 10 }, shown, [10])).status, "conflict");
  assert.equal((await control.execute({ id: "hidden", action: "done", taskId: 11 }, current, [10])).status, "conflict");
  assert.equal((await control.execute({ id: "idle", action: "pause" }, current, [10])).status, "conflict");
  current.date = "2026-10-27";
  assert.equal((await control.execute({ id: "midnight", action: "done", taskId: 10 }, shown, [10])).status, "conflict");
  assert.equal(writes, 0);
});

test("ambiguous transport failures are unknown, while HTTP conflicts are explicit", async () => {
  const s = sample();
  for (const [error, status] of [[new Error("timeout"), "unknown"], [new StudyHttpError(409), "conflict"], [new StudyHttpError(400), "error"]] as const) {
    const control = new StudyController(async () => s, async () => { throw error; });
    assert.equal((await control.execute({ id: "req", action: "done", taskId: 10 }, s, [10])).status, status);
  }
});

test("wire controls require opt-in capability, fresh issued batch and deduplicate in-flight commands", async () => {
  let now = 1000, writes = 0;
  let release: () => void = () => {};
  const sent: string[] = []; const socket = { readyState: 1, send: (s: string) => sent.push(s) };
  const s = sample();
  const bridge = new StudyBridge(true, async () => structuredClone(s), () => now, async () => {
    writes++; await new Promise<void>(resolve => { release = resolve; }); s.tasks[0].done = true;
  });
  bridge.register(socket, true, true); bridge.setControlsEnabled(true); await bridge.tick();
  const batch = JSON.parse(sent.filter(t => JSON.parse(t).type === "study").at(-1)!).batch;
  const command = JSON.stringify({ type: "studyAction", version: 1, id: "unique", action: "done", taskId: 10, batch });
  assert.equal(bridge.handleMessage(socket, command), true);
  assert.equal(bridge.handleMessage(socket, command), true);
  await settle(); assert.equal(writes, 1); release(); await settle();
  const receipts = sent.map(t => JSON.parse(t)).filter(v => v.type === "studyActionResult");
  assert.equal(receipts.length, 2); assert.ok(receipts.every(v => v.status === "ok"));
  assert.equal(bridge.handleMessage(socket, command), true); await settle(); assert.equal(writes, 1);
  now += 6000;
  bridge.handleMessage(socket, JSON.stringify({ type: "studyAction", version: 1, id: "stale-batch", action: "start", taskId: 10, batch }));
  await settle(); assert.equal(JSON.parse(sent.at(-1)!).status, "conflict"); assert.equal(writes, 1);
  bridge.setControlsEnabled(false);
  bridge.handleMessage(socket, JSON.stringify({ type: "studyAction", version: 1, id: "disabled", action: "done", taskId: 10, batch }));
  assert.equal(JSON.parse(sent.at(-1)!).status, "conflict");
});

test("legacy display capability cannot issue writes even with a valid batch", async () => {
  let writes = 0; const sent: string[] = []; const socket = { readyState: 1, send: (s: string) => sent.push(s) };
  const bridge = new StudyBridge(true, async () => sample(), () => 1000, async () => { writes++; });
  bridge.setControlsEnabled(true); bridge.register(socket, true, false); await bridge.tick();
  const header = JSON.parse(sent.find(t => JSON.parse(t).online)!); assert.equal(header.controls, false);
  bridge.handleMessage(socket, JSON.stringify({ type: "studyAction", version: 1, id: "legacy", action: "done", taskId: 10, batch: header.batch }));
  await settle(); assert.equal(writes, 0); assert.equal(JSON.parse(sent.at(-1)!).status, "conflict");
});
