import assert from "node:assert/strict";
import test from "node:test";

import { defaultDeviceConfig } from "../apps/web/src/state/default-config.ts";
import {
  createDraftState,
  isDraftDirty,
  keepLocal,
  receiveRemote
} from "../apps/web/src/state/draft-store.ts";
import { numericMetric, validateDraft } from "../apps/web/src/state/ui-state.ts";
import type { DeviceDisplayConfig, Snapshot } from "../apps/web/src/types.ts";

function config(overrides: Partial<DeviceDisplayConfig> = {}): DeviceDisplayConfig {
  return { ...structuredClone(defaultDeviceConfig), ...overrides };
}

test("真实零值保持为有效数据", () => {
  const snapshot: Snapshot = {
    version: 1,
    deviceTime: new Date().toISOString(),
    metrics: [{ id: "system.cpu", type: "gauge", title: "CPU", value: 0, unit: "%", updatedAt: new Date().toISOString() }],
    dashboards: []
  };
  assert.deepEqual(numericMetric(snapshot, "system.cpu", 0, 100).value, 0);
  assert.equal(numericMetric(snapshot, "system.cpu", 0, 100).state, "fresh");
});

test("越界百分比标记为异常而不是截断", () => {
  const snapshot: Snapshot = {
    version: 1,
    deviceTime: new Date().toISOString(),
    metrics: [{ id: "system.cpu", type: "gauge", title: "CPU", value: 101, updatedAt: new Date().toISOString() }],
    dashboards: []
  };
  assert.equal(numericMetric(snapshot, "system.cpu", 0, 100).state, "invalid");
});

test("硬件不支持的指标不会被误报为非法数据", () => {
  const snapshot: Snapshot = {
    version: 1,
    deviceTime: new Date().toISOString(),
    dashboards: [],
    metrics: [{
      id: "system.cpu.temperature",
      type: "gauge",
      title: "CPU 温度",
      value: null,
      unit: "°C",
      updatedAt: new Date().toISOString(),
      availability: "unsupported"
    }]
  };
  assert.equal(numericMetric(snapshot, "system.cpu.temperature", 0, 150).state, "unsupported");
});

test("空页面与低对比主题无法提交", () => {
  const emptySystem = config({
    page: "system",
    visible: { cpu: false, memory: false, exam: true }
  });
  assert.match(validateDraft(emptySystem) ?? "", /没有可显示/);
  const lowContrast = config({
    theme: { background: "#FFFFFF", card: "#FFFFFF", accent: "#EEEEEE", dataText: "#F2F6FA" }
  });
  assert.match(validateDraft(lowContrast) ?? "", /对比度/);
});

test("数据文字与卡片对比度不足时阻止提交", () => {
  const lowContrastData = config({
    theme: { ...defaultDeviceConfig.theme, dataText: defaultDeviceConfig.theme.card }
  });
  assert.match(validateDraft(lowContrastData) ?? "", /数据文字/);
});

test("Web 草稿接受受支持的中文标题并拒绝缺字标题", () => {
  assert.equal(validateDraft(config({ title: "ESP32 监控屏" })), null);
  assert.match(validateDraft(config({ title: "天气预报" })) ?? "", /字库/);
});

test("远端 revision 更新不会覆盖脏草稿", () => {
  const initial = config();
  const draft = { ...initial, title: "LOCAL DRAFT" };
  const state = { ...createDraftState(initial), draft };
  const remote = config({ revision: 2, title: "REMOTE" });
  const conflicted = receiveRemote(state, remote);
  assert.equal(conflicted.draft.title, "LOCAL DRAFT");
  assert.equal(conflicted.conflict?.revision, 2);
  const kept = keepLocal(conflicted);
  assert.equal(kept.draft.title, "LOCAL DRAFT");
  assert.equal(kept.base.revision, 2);
  assert.equal(isDraftDirty(kept), true);
});

test("场景排序与停留时间属于可保存草稿", () => {
  const initial = config();
  const scenes = [...initial.scenes];
  [scenes[0], scenes[1]] = [scenes[1], scenes[0]];
  scenes[0] = { ...scenes[0], durationSeconds: 45 };
  const state = { ...createDraftState(initial), draft: { ...initial, scenes } };
  assert.equal(isDraftDirty(state), true);
  assert.equal(validateDraft(state.draft), null);
});

test("Web 拒绝无启用场景和非法停留时间", () => {
  const disabled = config({ scenes: defaultDeviceConfig.scenes.map((scene) => ({ ...scene, enabled: false })) });
  assert.match(validateDraft(disabled) ?? "", /至少启用/);
  const invalidDuration = config({
    scenes: defaultDeviceConfig.scenes.map((scene, index) =>
      index === 0 ? { ...scene, durationSeconds: 9 } : scene)
  });
  assert.match(validateDraft(invalidDuration) ?? "", /10–3600/);
});
