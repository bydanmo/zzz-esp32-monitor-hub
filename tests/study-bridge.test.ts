import assert from "node:assert/strict";
import test from "node:test";
import { StudyBridge, studyFrames, validateStudySnapshot, type StudySnapshot } from "../apps/hub/src/study-bridge.js";

const sample = (): StudySnapshot => ({ protocol: 2, date: "2026-10-26", total: 5, completed: 1,
  tasks: Array.from({ length: 5 }, (_, id) => ({ id, title: '函数极限😀"\\'.repeat(30), done: id === 0, minutes: 30 })),
  session: { session_id: "12345678-1234-1234-1234-123456789012", revision: 3, status: "running", phase: "focus", mode: "pomodoro", elapsed_seconds: 120, remaining_seconds: 1380, task: { title: "函数".repeat(100) } } });

test("receipts must match a batch sent to that socket and expire without replay", async () => {
  let now = 1000;
  const frames: string[] = [];
  const socket = { readyState: 1, send: (s: string) => frames.push(s) };
  const stranger = { readyState: 1, send: () => {} };
  const bridge = new StudyBridge(true, async () => sample(), () => now);
  bridge.register(socket, true); await bridge.tick();
  const batch = JSON.parse(frames.findLast(s => JSON.parse(s).type === "study")!).batch;
  const ack = JSON.stringify({ type: "studyAck", version: 1, batch, total: 999 });
  assert.equal(bridge.handleMessage(stranger, ack), false);
  assert.equal(bridge.handleMessage(socket, JSON.stringify({ type: "studyAck", version: 1, batch: "fake" })), false);
  assert.equal(bridge.handleMessage(socket, ack), true);
  assert.equal(bridge.status().receipts[0].total, 5);
  assert.equal(bridge.status().receipts[0].fresh, true);
  now += 8001;
  assert.equal(bridge.status().receipts[0].fresh, false);
  assert.equal(bridge.handleMessage(socket, ack), false);
  bridge.remove(socket); assert.deepEqual(bridge.status().receipts, []);
});

test("disconnect and disable clear receipts, including empty-task snapshots", async () => {
  const frames: string[] = [];
  const socket = { readyState: 1, send: (s: string) => frames.push(s) };
  const bridge = new StudyBridge(true, async () => ({ ...sample(), tasks: [], total: 0, completed: 0 }));
  bridge.register(socket, true); await bridge.tick();
  const h = JSON.parse(frames.at(-1)!);
  assert.equal(bridge.handleMessage(socket, JSON.stringify({ type: "studyAck", version: 1, batch: h.batch })), true);
  assert.equal(bridge.status().receipts[0].total, 0);
  bridge.setEnabled(false); assert.deepEqual(bridge.status().receipts, []);
});
test("paginated UTF-8 frames stay below the firmware receive budget", () => {
  const frames = studyFrames(sample(), 1, "test-2");
  assert.equal(frames.length, 3);
  assert.ok(frames.every(frame => Buffer.byteLength(frame) < 512));
  assert.equal(JSON.parse(frames[0]).page, 1);
  assert.equal(JSON.parse(frames[1]).id, 3);
  assert.equal(JSON.parse(frames[0]).completed, 1);
  assert.equal(JSON.parse(frames[0]).focus.session_id, sample().session.session_id);
});
test("only opted-in sockets receive study data; page changes never write learning records", async () => {
  const sent: string[] = []; const socket = { readyState: 1, send: (s: string) => sent.push(s) };
  const bridge = new StudyBridge(false, async () => sample());
  bridge.register(socket, true); await bridge.tick(); assert.equal(sent.length, 0);
  bridge.setEnabled(true); await bridge.tick(); sent.length = 0;
  assert.equal(bridge.handleMessage(socket, '{"type":"studyPage","page":1}'), true);
  assert.equal(JSON.parse(sent[0]).page, 1);
  bridge.register(socket, false); sent.length = 0; await bridge.tick(); assert.equal(sent.length, 0);
});
test("unavailable service clears the projection and disable cannot be undone by an old poll", async () => {
  let finish: (v: unknown) => void = () => {};
  const sent: string[] = []; const socket = { readyState: 1, send: (s: string) => sent.push(s) };
  const bridge = new StudyBridge(true, () => new Promise(resolve => { finish = resolve; }));
  bridge.register(socket, true); const pending = bridge.tick(); bridge.setEnabled(false); finish(sample()); await pending;
  assert.equal(bridge.status().online, false);
  assert.equal(JSON.parse(sent.at(-1)!).online, false);
  assert.equal(JSON.parse(sent.at(-1)!).enabled, false);
  const offline = new StudyBridge(true, async () => { throw new Error("offline"); });
  offline.register(socket, true); await offline.tick(); assert.equal(JSON.parse(sent.at(-1)!).online, false);
});
test("malformed projection and oversized/invalid actions are rejected", () => {
  assert.throws(() => validateStudySnapshot({ ...sample(), session: {} }));
  const bridge = new StudyBridge(true); const socket = { readyState: 1, send: () => {} };
  bridge.register(socket, true);
  assert.equal(bridge.handleMessage(socket, '{"type":"studyPage","page":-1}'), false);
  assert.equal(bridge.handleMessage(socket, '{"type":"done","id":1}'), false);
});
test("transient failures do not refresh old samples; five-second outage becomes offline", async () => {
  let now = 1000, broken = false;
  const frames: string[] = []; const socket = { readyState: 1, send: (s: string) => frames.push(s) };
  const bridge = new StudyBridge(true, async () => { if (broken) throw new Error("timeout"); return sample(); }, () => now);
  bridge.register(socket, true); await bridge.tick(); frames.length = 0;
  broken = true; now += 2000; await bridge.tick();
  assert.equal(frames.length, 0); assert.equal(bridge.status().online, true);
  now += 3000; await bridge.tick(); assert.equal(JSON.parse(frames.at(-1)!).online, false);
  broken = false; await bridge.tick(); assert.equal(JSON.parse(frames.at(-4)!).online, true);
});
