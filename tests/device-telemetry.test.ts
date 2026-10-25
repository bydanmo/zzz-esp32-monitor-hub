import assert from "node:assert/strict";
import test from "node:test";
import { defaultDeviceConfig } from "../apps/hub/src/device-config.ts";
import { collectDeviceTelemetry } from "../apps/hub/src/device-telemetry.ts";
import type { MetricAvailability, Snapshot } from "../apps/hub/src/types.ts";

function snapshot(availability?: MetricAvailability): Snapshot {
  return {
    version: 1, deviceTime: "2026-10-25T00:00:00Z", dashboards: [],
    metrics: [{ id: "system.cpu", type: "gauge", title: "CPU", value: 42,
      availability, updatedAt: "2026-10-24T23:59:00Z" }]
  };
}

test("设备遥测不把失败来源的最后数值重新发送成新读数", () => {
  for (const availability of ["unavailable", "unsupported", "waiting"] as const) {
    assert.equal(collectDeviceTelemetry(snapshot(availability), defaultDeviceConfig).cpu, null);
  }
});

test("设备遥测保留有效零值与旧协议兼容，同时投影实际配置", () => {
  const input = snapshot("available");
  input.metrics[0].value = 0;
  const result = collectDeviceTelemetry(input, defaultDeviceConfig);
  assert.equal(result.cpu, 0);
  assert.equal(result.memory, null);
  assert.equal(result.examSeconds, null);
  assert.equal(result.config.schemaVersion, 1);
  assert.equal(result.config.revision, defaultDeviceConfig.revision);
  assert.equal(collectDeviceTelemetry(snapshot(), defaultDeviceConfig).cpu, 42);
});
