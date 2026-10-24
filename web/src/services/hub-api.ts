import type {
  DeviceConfigResponse,
  DeviceDisplayConfig,
  DevicesResponse,
  ExamTargetResponse,
  ProvidersResponse,
  Snapshot
} from "../types";

import { assertLiveMode, demoSnapshot, isDemoMode } from "./demo";
import { defaultDeviceConfig } from "../state/default-config";

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T | { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload === "object" && payload !== null &&
      "error" in payload && typeof (payload as { error?: string }).error === "string"
      ? (payload as { error: string }).error
      : "请求失败（" + response.status + "）");
  }
  return payload as T;
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  if (isDemoMode()) return demoSnapshot();
  return readJson<Snapshot>(await fetch("/api/snapshot", { signal }));
}

export async function fetchDeviceConfig(signal?: AbortSignal): Promise<DeviceConfigResponse> {
  if (isDemoMode()) return {config: structuredClone(defaultDeviceConfig), connectedDevices:0, pushedDevices:0};
  return readJson<DeviceConfigResponse>(await fetch("/api/device-config", { signal }));
}

export async function fetchDevices(signal?: AbortSignal): Promise<DevicesResponse> {
  if (isDemoMode()) return {devices: [], legacyConnections: 0};
  return readJson<DevicesResponse>(await fetch("/api/devices", { signal }));
}

export async function fetchProviders(signal?: AbortSignal): Promise<ProvidersResponse> {
  if (isDemoMode()) return {providers: [{id:"demo",label:"示例数据源（非真实监控）",status:"ready",lastAttemptAt:null,lastSuccessAt:null,errorCode:null,metricCount:10}]};
  return readJson<ProvidersResponse>(await fetch("/api/providers", { signal }));
}

export async function fetchExamTarget(signal?: AbortSignal): Promise<ExamTargetResponse> {
  if (isDemoMode()) return {target:{examAt:new Date(Date.now()+428*86400*1000).toISOString()},examSeconds:428*86400};
  return readJson<ExamTargetResponse>(await fetch("/api/exam-target", { signal }));
}

export async function saveExamTarget(examAt: string | null): Promise<ExamTargetResponse> {
  assertLiveMode();
  return readJson<ExamTargetResponse>(await fetch("/api/exam-target", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ examAt })
  }));
}

export async function saveDeviceConfig(config: DeviceDisplayConfig): Promise<DeviceConfigResponse> {
  assertLiveMode();
  return readJson<DeviceConfigResponse>(await fetch("/api/device-config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config)
  }));
}
