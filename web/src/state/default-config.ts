import type { DeviceDisplayConfig, DevicePage, DeviceScene } from "../types";

export function defaultScenes(): DeviceScene[] {
  return [
    { id: "overview", name: "总览", page: "overview", durationSeconds: 30, enabled: true,
      visible: { cpu: true, memory: true, exam: true } },
    { id: "system", name: "系统", page: "system", durationSeconds: 30, enabled: true,
      visible: { cpu: true, memory: true, exam: false } },
    { id: "study", name: "学习", page: "study", durationSeconds: 30, enabled: true,
      visible: { cpu: false, memory: false, exam: true } }
  ];
}

export const defaultDeviceConfig: DeviceDisplayConfig = {
  schemaVersion: 2,
  revision: 1,
  title: "ESP32 监控屏",
  activeSceneId: "overview",
  scenes: defaultScenes(),
  page: "overview",
  theme: {
    background: "#0D131B",
    card: "#17212D",
    accent: "#63D8C5",
    dataText: "#F2F6FA"
  },
  visible: { cpu: true, memory: true, exam: true }
};

export function normalizeDeviceConfig(config: DeviceDisplayConfig): DeviceDisplayConfig {
  const candidate = config as unknown as DeviceDisplayConfig & { schemaVersion: number };
  const page = candidate.page as DevicePage;
  if (candidate.schemaVersion === 2 && Array.isArray(candidate.scenes) &&
      typeof candidate.activeSceneId === "string") {
    const active = candidate.scenes.find((scene) => scene.id === candidate.activeSceneId);
    if (active) return {
      ...candidate,
      schemaVersion: 2,
      theme: { ...candidate.theme, dataText: candidate.theme.dataText ?? defaultDeviceConfig.theme.dataText },
      page: active.page,
      visible: structuredClone(active.visible)
    };
  }
  const scenes = defaultScenes();
  const active = scenes.find((scene) => scene.id === page) ?? scenes[0];
  active.visible = structuredClone(candidate.visible);
  return {
    ...candidate,
    schemaVersion: 2,
    activeSceneId: active.id,
    scenes,
    page: active.page,
    theme: { ...candidate.theme, dataText: candidate.theme.dataText ?? defaultDeviceConfig.theme.dataText },
    visible: structuredClone(active.visible)
  };
}
