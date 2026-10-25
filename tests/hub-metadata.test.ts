import assert from "node:assert/strict";
import test from "node:test";
import { fetchHubMetadata } from "../apps/web/src/services/hub-metadata.ts";
import { defaultDeviceConfig } from "../apps/web/src/state/default-config.ts";

test("考试目标首次请求失败不丢弃其他配置，下轮刷新自动重试并恢复", async () => {
  const originalFetch = globalThis.fetch;
  let targetCalls = 0;
  const target = { target: { examAt: "2027-12-25T01:00:00.000Z" }, examSeconds: 100 };
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path === "/api/exam-target") {
      if (++targetCalls === 1) return Response.json({ error: "temporary failure" }, { status: 503 });
      return Response.json(target);
    }
    if (path === "/api/device-config") return Response.json({ config: defaultDeviceConfig, connectedDevices: 1, pushedDevices: 0 });
    if (path === "/api/devices") return Response.json({ devices: [], legacyConnections: 1 });
    if (path === "/api/providers") return Response.json({ providers: [] });
    throw new Error(`Unexpected URL: ${path}`);
  };
  try {
    const first = await fetchHubMetadata();
    assert.equal(first.examTarget.status, "rejected");
    assert.equal(first.config.status, "fulfilled");
    assert.equal(first.devices.status, "fulfilled");
    assert.equal(first.providers.status, "fulfilled");
    const recovered = await fetchHubMetadata();
    assert.equal(recovered.examTarget.status, "fulfilled");
    if (recovered.examTarget.status === "fulfilled") assert.deepEqual(recovered.examTarget.value, target);
    assert.equal(targetCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("其他配置请求失败不会丢弃已成功加载的考试目标", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input) === "/api/exam-target") return Response.json({ target: { examAt: null }, examSeconds: null });
    throw new Error("temporary failure");
  };
  try {
    const result = await fetchHubMetadata();
    assert.equal(result.examTarget.status, "fulfilled");
    assert.equal(result.config.status, "rejected");
    assert.equal(result.devices.status, "rejected");
    assert.equal(result.providers.status, "rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
