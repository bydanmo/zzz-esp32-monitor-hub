import { projectDeviceConfig } from "./device-config.js";
import type { DeviceDisplayConfig, Snapshot } from "./types.js";

/** The v1 device frame has no per-metric status: null preserves unavailable data. */
export function collectDeviceTelemetry(snapshot: Snapshot, config: DeviceDisplayConfig) {
  const value = (id: string): number | null => {
    const metric = snapshot.metrics.find((entry) => entry.id === id);
    if (metric?.availability && metric.availability !== "available") return null;
    return typeof metric?.value === "number" && Number.isFinite(metric.value) ? metric.value : null;
  };
  return {
    type: "telemetry",
    cpu: value("system.cpu"),
    memory: value("system.memory"),
    examSeconds: value("study.exam"),
    deviceTime: snapshot.deviceTime,
    config: projectDeviceConfig(config)
  };
}
