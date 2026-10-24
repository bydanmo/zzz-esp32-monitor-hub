import { uiTokens } from "../design/ui-contracts.generated";
import type { DeviceDisplayConfig, Metric, Snapshot } from "../types";
import { displayTitleError } from "./title-validation";

export type DataState = "waiting" | "fresh" | "delayed" | "stale" | "unsupported" | "unavailable" | "invalid";
export type HubConnectionState = "connecting" | "online" | "reconnecting" | "offline";

export function findMetric(snapshot: Snapshot | null, id: string): Metric | undefined {
  return snapshot?.metrics.find((metric) => metric.id === id);
}

export function numericMetric(snapshot: Snapshot | null, id: string, min = 0, max = Number.MAX_SAFE_INTEGER):
  { value: number | null; state: DataState; updatedAt: string | null } {
  const metric = findMetric(snapshot, id);
  if (!metric) return { value: null, state: snapshot ? "unavailable" : "waiting", updatedAt: null };
  if (metric.availability && metric.availability !== "available") {
    return { value: null, state: metric.availability, updatedAt: metric.updatedAt };
  }
  if (typeof metric.value !== "number" || !Number.isFinite(metric.value) ||
      metric.value < min || metric.value > max) {
    return { value: null, state: "invalid", updatedAt: metric.updatedAt };
  }
  const timestamp = Date.parse(metric.updatedAt);
  if (!Number.isFinite(timestamp)) return { value: null, state: "invalid", updatedAt: metric.updatedAt };
  const age = Math.max(0, Date.now() - timestamp);
  const state = age <= uiTokens.freshnessMs.fresh
    ? "fresh"
    : age <= uiTokens.freshnessMs.stale ? "delayed" : "stale";
  return { value: metric.value, state, updatedAt: metric.updatedAt };
}

export function dataStateLabel(state: DataState): string {
  return {
    waiting: "等待数据",
    fresh: "刚刚更新",
    delayed: "数据延迟",
    stale: "数据已陈旧",
    unsupported: "当前来源不支持",
    unavailable: "数据源未提供",
    invalid: "数据异常"
  }[state];
}

export function editableConfig(config: DeviceDisplayConfig) {
  return {
    title: config.title,
    activeSceneId: config.activeSceneId,
    scenes: config.scenes,
    page: config.page,
    theme: config.theme,
    visible: config.visible
  };
}

export function sameEditableConfig(left: DeviceDisplayConfig, right: DeviceDisplayConfig): boolean {
  return JSON.stringify(editableConfig(left)) === JSON.stringify(editableConfig(right));
}

export function pageHasContent(config: DeviceDisplayConfig): boolean {
  if (config.page === "system") return config.visible.cpu || config.visible.memory;
  if (config.page === "study") return config.visible.exam;
  return config.visible.cpu || config.visible.memory || config.visible.exam;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function validateDraft(config: DeviceDisplayConfig): string | null {
  const titleError = displayTitleError(config.title);
  if (titleError) return titleError;
  if (config.scenes.length < 1 || config.scenes.length > 8) return "场景数量必须为 1–8 个。";
  if (!config.scenes.some((scene) => scene.enabled)) return "至少启用一个场景。";
  const activeScene = config.scenes.find((scene) => scene.id === config.activeSceneId);
  if (!activeScene?.enabled) return "当前场景必须处于启用状态。";
  const ids = new Set<string>();
  for (const scene of config.scenes) {
    if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(scene.id) || ids.has(scene.id)) return "场景 ID 无效或重复。";
    ids.add(scene.id);
    if (!Number.isInteger(scene.durationSeconds) || scene.durationSeconds < 10 || scene.durationSeconds > 3600) {
      return "场景停留时间必须为 10–3600 秒。";
    }
    if (!scene.visible.cpu && !scene.visible.memory && !scene.visible.exam) return `场景“${scene.name}”没有可显示指标。`;
    if (scene.page === "system" && !scene.visible.cpu && !scene.visible.memory) return `场景“${scene.name}”没有系统指标。`;
    if (scene.page === "study" && !scene.visible.exam) return `场景“${scene.name}”没有学习指标。`;
  }
  if (!config.visible.cpu && !config.visible.memory && !config.visible.exam) {
    return "至少保留一个显示指标。";
  }
  if (!pageHasContent(config)) {
    return "当前页面没有可显示的指标，请开启对应指标或切换页面。";
  }
  if (contrastRatio("#F2F6FA", config.theme.background) < 4.5 ||
      contrastRatio("#F2F6FA", config.theme.card) < 4.5) {
    return "主文字与背景或卡片的对比度不足 4.5:1。";
  }
  if (contrastRatio(config.theme.accent, config.theme.background) < 3) {
    return "强调色与背景的对比度不足 3:1。";
  }
  if (contrastRatio(config.theme.dataText, config.theme.card) < 3) {
    return "数据文字与卡片的对比度不足 3:1。";
  }
  return null;
}
