import test from "node:test";
import assert from "node:assert/strict";
import { demoSnapshot, isDemoMode } from "../web/src/services/demo";
import { fetchDeviceConfig, fetchDevices, fetchSnapshot, saveDeviceConfig, saveExamTarget } from "../web/src/services/hub-api";
import { defaultDeviceConfig } from "../web/src/state/default-config";

test("only explicit mode=demo enables the sample source", () => {
  assert.equal(isDemoMode(""), false);
  assert.equal(isDemoMode("?theme=arcade"), false);
  assert.equal(isDemoMode("?mode=demo"), true);
  assert.equal(isDemoMode("?mode=live"), false);
});

test("demo data is time-stamped, bounded and visibly labelled", () => {
  const snapshot = demoSnapshot(1700000000000);
  assert.equal(snapshot.deviceTime, new Date(1700000000000).toISOString());
  assert.match(String(snapshot.metrics.find(item => item.id === "system.host")?.value), /DEMO/);
  for (const item of snapshot.metrics.filter(item => item.unit === "%"))
    assert.ok(typeof item.value === "number" && item.value >= 0 && item.value <= 100);
});

test("demo reads and rejected writes never call the real network", async () => {
  const oldLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  const oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "location", { value: { search: "?mode=demo" }, configurable: true });
  let calls = 0;
  globalThis.fetch = async () => { ++calls; throw new Error("unexpected network"); };
  try {
    assert.match(String((await fetchSnapshot()).metrics.find(item => item.id === "system.host")?.value), /DEMO/);
    assert.equal((await fetchDevices()).devices.length, 0);
    const first = await fetchDeviceConfig(); first.config.title = "changed";
    assert.equal((await fetchDeviceConfig()).config.title, defaultDeviceConfig.title);
    await assert.rejects(saveExamTarget(null), /演示模式为只读/);
    await assert.rejects(saveDeviceConfig(defaultDeviceConfig), /演示模式为只读/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldLocation) Object.defineProperty(globalThis, "location", oldLocation);
    else Reflect.deleteProperty(globalThis, "location");
  }
});
