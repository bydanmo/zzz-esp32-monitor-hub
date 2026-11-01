import test from "node:test";
import assert from "node:assert/strict";
import { StudyController, validStudyDuration } from "../apps/hub/src/study-control.ts";
const snapshot = () => ({ protocol: 2, date: "2026-10-31", completed: 0, total: 1,
  tasks: [{ id: 1, title: "测试夹具", done: false, minutes: 0 }],
  session: { revision: 1, status: "idle", phase: "focus", mode: "pomodoro", elapsed_seconds: 0, remaining_seconds: 0, task: null } });
test("only start accepts whole-minute durations between one and 120 minutes", () => {
  for (const value of [60, 1500, 2700, 7200]) assert.equal(validStudyDuration("start", value), true);
  for (const value of [0, 59, 61, 7201, NaN, Infinity, "1500", true]) assert.equal(validStudyDuration("start", value), false);
  for (const action of ["pause", "resume", "end", "done"]) assert.equal(validStudyDuration(action, 1500), false);
  assert.equal(validStudyDuration("start", undefined), true);
});
test("selected duration reaches the PC unchanged; invalid or mid-session changes never write", async () => {
  const current = snapshot(); const writes: Record<string, unknown>[] = [];
  const control = new StudyController(async () => current, async (_path, body) => { writes.push(body); });
  assert.equal((await control.execute({ id: "chosen", action: "start", taskId: 1, durationSeconds: 2700 }, current, [1])).status, "ok");
  assert.equal(writes[0].duration_seconds, 2700);
  assert.equal((await control.execute({ id: "bad", action: "start", taskId: 1, durationSeconds: 59 }, current, [1])).status, "error");
  current.session.status = "running";
  assert.equal((await control.execute({ id: "pause-change", action: "pause", durationSeconds: 3000 }, current, [1])).status, "error");
  assert.equal(writes.length, 1);
});
