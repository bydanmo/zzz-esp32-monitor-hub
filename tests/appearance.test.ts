import assert from "node:assert/strict";
import test from "node:test";
import { defaultAppearance, normalizeAppearance, readAppearance, themeEditions } from "../web/src/design/appearance";
import { defaultDeviceConfig } from "../web/src/state/default-config";
import { configurationDelivery } from "../web/src/state/configuration-delivery";
import { validateDraft } from "../web/src/state/ui-state";
import type { DeviceSessionView } from "../web/src/types";

test("corrupt or unsupported appearance storage safely returns local defaults", () => {
  for (const value of [null, "{broken", 'null', '[]', '{"version":2,"theme":"night"}']) {
    assert.deepEqual(readAppearance(value), defaultAppearance);
  }
  const result = normalizeAppearance({ ...defaultAppearance, theme: "unknown", shell: "red", motion: "always", paused: "false", injected: true });
  assert.deepEqual(result, defaultAppearance);
});

test("valid browser appearance restores without carrying device configuration fields", () => {
  const saved = { ...defaultAppearance, theme: "arcade", motion: "reduced", shell: "ivory", paused: true };
  assert.deepEqual(readAppearance(JSON.stringify({ ...saved, revision: 99, title: "不要写入设备" })), saved);
});

test("all six device palette presets satisfy the existing device draft contract", () => {
  const original = JSON.stringify(defaultDeviceConfig);
  for (const edition of themeEditions) {
    const draft = { ...structuredClone(defaultDeviceConfig), theme: { ...edition.deviceTheme } };
    assert.equal(validateDraft(draft), null, edition.id);
  }
  assert.equal(JSON.stringify(defaultDeviceConfig), original);
});

const device = (patch: Partial<DeviceSessionView> = {}): DeviceSessionView => ({
  id: "qa-01", model: "QA", firmwareVersion: "test", protocolVersion: 1, capabilities: [],
  connectedAt: "2026-10-23T00:00:00Z", lastSeenAt: "2026-10-23T00:00:00Z",
  pushedRevision: 21, appliedRevision: null, configState: "pushed", rejectionReason: null, ...patch
});

test("Hub saved or pushed is not treated as device application confirmation", () => {
  assert.equal(configurationDelivery([], 21, 0, true).state, "waiting");
  assert.equal(configurationDelivery([device()], 21, 1, true).state, "pending");
  assert.equal(configurationDelivery([device({ configState: "applied", appliedRevision: 20 })], 21, 1, true).state, "pending");
  assert.equal(configurationDelivery([device({ configState: "applied", appliedRevision: 22 })], 21, 1, true).state, "pending");
  assert.equal(configurationDelivery([device({ configState: "applied", appliedRevision: 21 })], 21, 1, true).state, "applied");
});

test("rejections, unidentified devices and disconnected Hub retain their actual uncertainty", () => {
  assert.equal(configurationDelivery([device({ configState: "rejected" })], 21, 1, true).state, "rejected");
  assert.equal(configurationDelivery([device({ configState: "rejected", pushedRevision: 20 })], 21, 1, true).state, "pending");
  assert.equal(configurationDelivery([], 21, 1, true).state, "pending");
  assert.equal(configurationDelivery([device({ configState: "applied", appliedRevision: 21 })], 21, 1, false).state, "waiting");
});
