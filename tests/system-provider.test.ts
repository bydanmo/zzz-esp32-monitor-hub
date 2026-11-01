import assert from "node:assert/strict";
import test from "node:test";
import { SystemProvider } from "../apps/hub/src/providers/system-provider.ts";
import type { SystemSource } from "../apps/hub/src/providers/system-source.ts";
import { NetworkRateTracker } from "../apps/hub/src/providers/windows-native-source.ts";
import { collectSnapshot } from "../apps/hub/src/telemetry.ts";
import { collectDeviceTelemetry } from "../apps/hub/src/device-telemetry.ts";
import { defaultDeviceConfig } from "../apps/hub/src/device-config.ts";

function source(overrides: Partial<SystemSource> = {}): SystemSource {
  return {
    async currentLoad() { return { currentLoad: 17 }; },
    async mem() { return { total: 1000, available: 750 }; },
    async cpuTemperature() { return { main: null }; },
    async graphics() { return { controllers: [{ utilizationGpu: 0, temperatureGpu: 51 }] }; },
    async fsSize() { return [{ mount: "C:", use: 62 }]; },
    async networkStats() { return [{ iface: "7", operstate: "up", rx_sec: 0, tx_sec: 120 }]; },
    ...overrides
  };
}

test("采集保留十项指标、真实零值及旧固件的 CPU/内存投影", async () => {
  const provider = new SystemProvider(2000, source());
  const metrics = await provider.collect(new AbortController().signal);
  assert.equal(metrics.length, 10);
  assert.equal(metrics.find((item) => item.id === "system.cpu.temperature")?.availability, "unsupported");
  assert.equal(metrics.find((item) => item.id === "system.gpu")?.value, 0);
  assert.equal(metrics.find((item) => item.id === "system.network.download")?.value, 0);
  const frame = collectDeviceTelemetry(collectSnapshot({ examAt: null }, metrics), defaultDeviceConfig);
  assert.equal(frame.cpu, 17);
  assert.equal(frame.memory, 25);
});

test("网卡首次采样及负数速率标为等待，采集失败不会清掉 CPU/内存", async () => {
  const provider = new SystemProvider(2000, source({
    async networkStats() { return [{ iface: "7", operstate: "up", rx_sec: -1, tx_sec: null }]; },
    async graphics() { throw new Error("DRIVER_UNAVAILABLE"); },
    async fsSize() { throw new Error("DISK_UNAVAILABLE"); }
  }));
  const metrics = await provider.collect(new AbortController().signal);
  assert.equal(metrics.length, 10);
  assert.equal(metrics.find((item) => item.id === "system.cpu")?.value, 17);
  assert.equal(metrics.find((item) => item.id === "system.memory")?.value, 25);
  assert.equal(metrics.find((item) => item.id === "system.network.download")?.value, null);
  assert.equal(metrics.find((item) => item.id === "system.network.download")?.availability, "waiting");
  assert.equal(metrics.find((item) => item.id === "system.gpu")?.availability, "unsupported");
  assert.equal(metrics.find((item) => item.id === "system.disk")?.availability, "unavailable");
});

test("取消后的采集不启动读取，非法刷新间隔不能造成紧密循环", async () => {
  let calls = 0;
  const provider = new SystemProvider(1, source({ async currentLoad() { calls++; return { currentLoad: 0 }; } }));
  assert.equal(provider.refreshIntervalMs, 2000);
  assert.equal(new SystemProvider(NaN, source()).refreshIntervalMs, 2000);
  assert.equal(new SystemProvider(Infinity, source()).refreshIntervalMs, 2000);
  assert.equal(new SystemProvider(10_000, source()).refreshIntervalMs, 10_000);
  await assert.rejects(provider.collect(AbortSignal.abort()), /PROVIDER_TIMEOUT/);
  assert.equal(calls, 0);
});

test("网速以真实间隔和 64 位差值计算，切换、断开和计数器重置均重新建立基线", () => {
  const tracker = new NetworkRateTracker();
  const base = 2n ** 60n;
  const counters = (index: number, received: bigint, sent: bigint) => ({ index, received, sent });
  const waiting = { download: null, upload: null };
  assert.deepEqual(tracker.update(counters(7, base, base), 1000), waiting);
  assert.deepEqual(tracker.update(counters(7, base + 1000n, base + 500n), 3000), { download: 500, upload: 250 });
  assert.deepEqual(tracker.update(counters(8, base + 3000n, base + 3000n), 5000), waiting);
  assert.deepEqual(tracker.update(counters(8, 1n, 2n), 7000), waiting);
  assert.deepEqual(tracker.update(counters(8, 1n, 2n), 9000), { download: 0, upload: 0 });
  assert.deepEqual(tracker.update(null, 10_000), waiting);
  assert.deepEqual(tracker.update(counters(8, 10n, 20n), 11_000), waiting);
  assert.deepEqual(tracker.update(counters(8, 11n, 21n), 11_000), waiting);
});
