import assert from "node:assert/strict";
import test from "node:test";

import {
  examTargetToLocalInput,
  localInputToExamTarget
} from "../web/src/state/exam-target.ts";

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
