import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultDeviceConfig,
  projectDeviceConfig,
  validateDeviceConfig
} from "../hub/src/device-config.ts";

test("Hub 配置校验规范化颜色并使用服务端 revision", () => {
  const result = validateDeviceConfig({
    ...structuredClone(defaultDeviceConfig),
    revision: 999,
    theme: { background: "#0d131b", card: "#17212d", accent: "#63d8c5", dataText: "#f2f6fa" }
  }, 3);
  assert.equal(result.revision, 3);
  assert.equal(result.theme.accent, "#63D8C5");
  assert.equal(result.theme.dataText, "#F2F6FA");
});

test("Hub 为旧配置补上默认数据文字颜色", () => {
  const legacy = projectDeviceConfig(structuredClone(defaultDeviceConfig)) as unknown as {
    schemaVersion: number;
    theme: Record<string, unknown>;
  };
  delete legacy.theme.dataText;
  const result = validateDeviceConfig(legacy, 4);
  assert.equal(result.theme.dataText, "#F2F6FA");
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.scenes.length, 3);
});

test("Hub 拒绝格式错误的数据文字颜色", () => {
  assert.throws(() => validateDeviceConfig({
    ...structuredClone(defaultDeviceConfig),
    theme: { ...defaultDeviceConfig.theme, dataText: "white" }
  }, 2), /#RRGGBB/);
});

test("Hub 拒绝没有有效内容的页面", () => {
  const invalid = structuredClone(defaultDeviceConfig);
  invalid.scenes[2].visible.exam = false;
  invalid.activeSceneId = "study";
  assert.throws(() => validateDeviceConfig({
    ...invalid,
    page: "study",
    visible: invalid.scenes[2].visible
  }, 2), /至少保留|场景页面/);
});

test("Hub 接受设备字库支持的中文标题", () => {
  const result = validateDeviceConfig({
    ...structuredClone(defaultDeviceConfig),
    title: "ESP32 监控屏"
  }, 7);
  assert.equal(result.title, "ESP32 监控屏");
  assert.equal(result.revision, 7);
});

test("Hub 拒绝超长或字库不支持的标题", () => {
  assert.throws(() => validateDeviceConfig({
    ...structuredClone(defaultDeviceConfig),
    title: "1234567890123"
  }, 2), /1–12/);
  assert.throws(() => validateDeviceConfig({
    ...structuredClone(defaultDeviceConfig),
    title: "天气预报"
  }, 2), /设备字库/);
});

test("Hub 将 v1 配置迁移为可排序场景并保持设备兼容投影", () => {
  const legacy = projectDeviceConfig(structuredClone(defaultDeviceConfig));
  legacy.page = "system";
  legacy.visible = { cpu: true, memory: false, exam: false };
  const migrated = validateDeviceConfig(legacy, 15);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.activeSceneId, "system");
  assert.deepEqual(migrated.visible, legacy.visible);
  assert.deepEqual(projectDeviceConfig(migrated), { ...legacy, revision: 15 });
});

test("Hub 拒绝重复场景、越界停留时间和全部停用", () => {
  const duplicate = structuredClone(defaultDeviceConfig);
  duplicate.scenes[1].id = duplicate.scenes[0].id;
  assert.throws(() => validateDeviceConfig(duplicate, 2), /重复/);

  const duration = structuredClone(defaultDeviceConfig);
  duration.scenes[0].durationSeconds = 5;
  assert.throws(() => validateDeviceConfig(duration, 2), /10–3600/);

  const disabled = structuredClone(defaultDeviceConfig);
  disabled.scenes.forEach((scene) => { scene.enabled = false; });
  assert.throws(() => validateDeviceConfig(disabled, 2), /至少启用/);
});
