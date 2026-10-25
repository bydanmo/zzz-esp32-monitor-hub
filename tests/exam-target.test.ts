import assert from "node:assert/strict";
import test from "node:test";

import { examSecondsRemaining, validateExamTarget } from "../apps/hub/src/exam-target.ts";
import { collectSnapshot } from "../apps/hub/src/telemetry.ts";

test("考试目标必须是带时区的 ISO 8601 时间", () => {
  assert.throws(() => validateExamTarget({ examAt: "2027-12-25T09:00:00" }), /时区/);
  assert.throws(() => validateExamTarget({ examAt: "下个月" }), /时区/);
  assert.deepEqual(validateExamTarget({ examAt: "2027-12-25T09:00:00+08:00" }),
    { examAt: "2027-12-25T09:00:00+08:00" });
});

test("未配置考试目标时倒计时没有数值", () => {
  assert.equal(validateExamTarget({}).examAt, null);
  assert.equal(validateExamTarget({ examAt: null }).examAt, null);
  assert.equal(examSecondsRemaining({ examAt: null }), null);
});

test("考试目标拒绝被 Date.parse 自动顺延的日期并正确处理闰年", () => {
  for (const examAt of ["2027-02-30T09:00:00+08:00", "2027-04-31T09:00:00+08:00",
    "2100-02-29T09:00:00Z", "2027-12-25T24:00:00Z"]) {
    assert.throws(() => validateExamTarget({ examAt }), /有效时间/);
  }
  for (const examAt of ["2028-02-29T09:00:00+08:00", "2000-02-29T09:00:00Z"]) {
    assert.deepEqual(validateExamTarget({ examAt }), { examAt });
  }
});

test("剩余秒数按目标时刻与当前时刻计算，过期归零", () => {
  const target = { examAt: "2027-12-25T09:00:00+08:00" };
  assert.equal(examSecondsRemaining(target, new Date("2027-12-25T00:59:00.000Z")), 60);
  assert.equal(examSecondsRemaining(target, new Date("2027-12-25T02:00:00.000Z")), 0);
});

test("快照只在配置了目标时提供 study.exam 指标", () => {
  const withoutTarget = collectSnapshot({ examAt: null });
  assert.equal(withoutTarget.metrics.some((metric) => metric.id === "study.exam"), false);

  const withTarget = collectSnapshot({ examAt: "2027-12-25T09:00:00+08:00" });
  const exam = withTarget.metrics.find((metric) => metric.id === "study.exam");
  assert.equal(typeof exam?.value, "number");
  assert.ok((exam?.value as number) > 0);
});

test("Provider 指标覆盖基础指标且不再注入模拟 AI 数据", () => {
  const snapshot = collectSnapshot({ examAt: null }, [{
    id: "system.cpu",
    type: "gauge",
    title: "CPU",
    value: 12.5,
    unit: "%",
    updatedAt: new Date().toISOString(),
    sourceId: "test"
  }]);
  assert.equal(snapshot.metrics.find((metric) => metric.id === "system.cpu")?.value, 12.5);
  assert.equal(snapshot.metrics.some((metric) => metric.id === "ai.deepseek.requests"), false);
});
