import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { ProviderManager } from "../apps/hub/src/provider-manager.ts";
import type { MetricProvider } from "../apps/hub/src/providers/provider.ts";
import type { Metric } from "../apps/hub/src/types.ts";

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Provider 未在期限内进入预期状态");
    await delay(5);
  }
}

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

test("Provider 失败后旧值标为不可用，恢复采集后才重新可用", async () => {
  let calls = 0;
  let shouldFail = true;
  const firstTimestamp = "2026-10-25T00:00:00.000Z";
  const provider: MetricProvider = {
    id: "recoverable",
    label: "可恢复来源",
    refreshIntervalMs: 5,
    async collect() {
      calls += 1;
      if (calls > 1 && shouldFail) throw new Error("SOURCE_DOWN");
      return [{ id: "system.cpu", type: "gauge", title: "CPU",
        value: calls === 1 ? 42 : 73, updatedAt: calls === 1 ? firstTimestamp : new Date().toISOString() }];
    }
  };
  const manager = new ProviderManager([provider], 100);
  try {
    await manager.start();
    assert.equal(manager.metrics()[0]?.availability, "available");
    await waitUntil(() => manager.states()[0]?.status === "degraded");
    assert.equal(manager.metrics()[0]?.value, 42);
    assert.equal(manager.metrics()[0]?.updatedAt, firstTimestamp);
    assert.equal(manager.metrics()[0]?.availability, "unavailable");
    assert.equal(manager.states()[0]?.errorCode, "SOURCE_DOWN");

    shouldFail = false;
    await waitUntil(() => manager.states()[0]?.status === "ready");
    assert.equal(manager.metrics()[0]?.value, 73);
    assert.equal(manager.metrics()[0]?.availability, "available");
    assert.equal(manager.states()[0]?.errorCode, null);
  } finally {
    manager.stop();
  }
});

test("不响应取消的 Provider 超时后不会重入，采集结束后恢复轮询", async () => {
  let calls = 0;
  let release: (metrics: Metric[]) => void = () => undefined;
  const pending = new Promise<Metric[]>((resolve) => { release = resolve; });
  const provider: MetricProvider = {
    id: "uncancellable",
    label: "不可取消来源",
    refreshIntervalMs: 5,
    async collect() {
      calls += 1;
      if (calls === 1) return pending;
      return [{ id: "system.cpu", type: "gauge", title: "CPU", value: 84,
        updatedAt: new Date().toISOString() }];
    }
  };
  const manager = new ProviderManager([provider], 5);
  try {
    await manager.start();
    assert.equal(manager.states()[0]?.errorCode, "PROVIDER_TIMEOUT");
    await delay(40);
    assert.equal(calls, 1, "尚未结束的采集不能被重复启动");
    assert.deepEqual(manager.metrics(), []);
    release([{ id: "system.cpu", type: "gauge", title: "CPU", value: 999,
      updatedAt: new Date().toISOString() }]);
    await waitUntil(() => manager.states()[0]?.status === "ready");
    assert.ok(calls >= 2);
    assert.equal(manager.metrics()[0]?.value, 84, "超时后迟到的结果不应作为成功采集发布");
  } finally {
    manager.stop();
    release([]);
  }
});
