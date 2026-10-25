import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptSavedExamTarget,
  createExamTargetDraft,
  examTargetToLocalInput,
  localInputToExamTarget,
  receiveExamTarget
} from "../apps/web/src/state/exam-target.ts";

test("考试目标在本地输入和带时区 ISO 时间之间保持同一时刻", () => {
  const source = "2027-12-25T09:00:00+08:00";
  const local = examTargetToLocalInput(source);
  assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(Date.parse(localInputToExamTarget(local)), Date.parse(source));
});

test("空目标和非法本地时间不会产生伪造日期", () => {
  assert.equal(examTargetToLocalInput(null), "");
  assert.equal(examTargetToLocalInput("not-a-date"), "");
  assert.throws(() => localInputToExamTarget(""), /有效/);
  assert.throws(() => localInputToExamTarget("2027-12-25"), /有效/);
});

const targetA = "2027-12-25T09:00:00+08:00";
const targetB = "2027-12-26T09:00:00+08:00";

test("考试目标首次为空也能完成加载，后续远端更新刷新未编辑输入", () => {
  const empty = receiveExamTarget(createExamTargetDraft(), null, "尚未设置考试目标");
  assert.equal(empty.loaded, true);
  assert.equal(empty.value, "");
  assert.equal(empty.status, "尚未设置考试目标");
  const loaded = receiveExamTarget(empty, targetA, "已载入");
  assert.equal(loaded.value, examTargetToLocalInput(targetA));
  assert.equal(loaded.base, loaded.value);
});

test("目标轮询和重连刷新不覆盖未保存输入", () => {
  const initial = receiveExamTarget(createExamTargetDraft(), targetA, "已载入");
  const dirty = { ...initial, value: "2028-01-01T09:00", status: "有未保存的目标修改" };
  assert.equal(receiveExamTarget(dirty, targetA, "已载入"), dirty);
  const refreshed = receiveExamTarget(dirty, targetB, "已载入");
  assert.equal(refreshed.value, dirty.value);
  assert.equal(refreshed.base, examTargetToLocalInput(targetB));
  assert.match(refreshed.status, /未保存/);
});

test("目标保存期间的新输入不会被成功回执覆盖", () => {
  const initial = receiveExamTarget(createExamTargetDraft(), null, "已载入");
  const submitted = examTargetToLocalInput(targetA);
  const edited = { ...initial, value: examTargetToLocalInput(targetB), pendingSave: true };
  const done = acceptSavedExamTarget(edited, submitted, targetA, "已保存");
  assert.equal(done.base, submitted);
  assert.equal(done.value, examTargetToLocalInput(targetB));
  assert.equal(done.pendingSave, false);
  assert.match(done.status, /后续修改/);
  assert.equal(receiveExamTarget(done, targetA, "已载入"), done);
});

test("保存期间改回旧目标时，轮询与回执仍保留撤回修改的意图", () => {
  const initial = receiveExamTarget(createExamTargetDraft(), targetA, "已载入");
  const pending = { ...initial, pendingSave: true };
  const polled = receiveExamTarget(pending, targetB, "已载入");
  assert.equal(polled, pending);
  const done = acceptSavedExamTarget(polled, examTargetToLocalInput(targetB), targetB, "已保存");
  assert.equal(done.value, examTargetToLocalInput(targetA));
  assert.equal(done.base, examTargetToLocalInput(targetB));
});

test("没有后续编辑时，目标清除回执会清空输入", () => {
  const initial = receiveExamTarget(createExamTargetDraft(), targetA, "已载入");
  const done = acceptSavedExamTarget({ ...initial, pendingSave: true }, initial.value, null, "已清除");
  assert.equal(done.base, "");
  assert.equal(done.value, "");
  assert.equal(done.pendingSave, false);
  assert.equal(done.status, "已清除");
});
