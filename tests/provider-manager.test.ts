import assert from "node:assert/strict";
import test from "node:test";

import { ProviderManager } from "../hub/src/provider-manager.ts";
import type { MetricProvider } from "../hub/src/providers/provider.ts";

test("Provider 失败不会阻止其他来源发布指标", async () => {
  const good: MetricProvider = {
    id: "good",
    label: "正常来源",
    refreshIntervalMs: 60_000,
    async collect() {
      return [{ id: "test.value", type: "gauge", title: "测试", value: 42, updatedAt: new Date().toISOString() }];
    }
  };
  const bad: MetricProvider = {
    id: "bad",
    label: "失败来源",
    refreshIntervalMs: 60_000,
    async collect() { throw new Error("SOURCE_DOWN"); }
  };
  const manager = new ProviderManager([good, bad], 100);
  await manager.start();
  manager.stop();
  assert.equal(manager.metrics()[0]?.value, 42);
  assert.equal(manager.states().find((state) => state.id === "good")?.status, "ready");
  assert.equal(manager.states().find((state) => state.id === "bad")?.status, "failed");
});

test("Provider 超时被隔离并报告稳定错误码", async () => {
  const slow: MetricProvider = {
    id: "slow",
    label: "超时来源",
    refreshIntervalMs: 60_000,
    async collect() { return new Promise(() => undefined); }
  };
  const manager = new ProviderManager([slow], 5);
  await manager.start();
  manager.stop();
  assert.equal(manager.states()[0]?.status, "failed");
  assert.equal(manager.states()[0]?.errorCode, "PROVIDER_TIMEOUT");
});
