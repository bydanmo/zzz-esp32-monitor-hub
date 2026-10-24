import type { DeviceDisplayConfig, DevicePage } from "../types";

export const pageNames: Record<DevicePage, string> = { overview: "总览", system: "系统", study: "学习" };

export function availablePreviewPages(visible: DeviceDisplayConfig["visible"]): DevicePage[] {
  return ["overview", ...(visible.cpu || visible.memory ? ["system" as const] : []),
    ...(visible.exam ? ["study" as const] : [])];
}

/** Local browsing must never rewrite a saved scene's page or visibility. */
export function withPreviewPage(config: DeviceDisplayConfig, requested: DevicePage): DeviceDisplayConfig {
  const pages = availablePreviewPages(config.visible);
  const page = pages.includes(requested) ? requested : pages.includes(config.page) ? config.page : "overview";
  return { ...config, page };
}
