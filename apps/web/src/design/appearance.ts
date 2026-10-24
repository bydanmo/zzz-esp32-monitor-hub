import type { DeviceDisplayConfig } from "../types";

export const themeIds = ["signal", "tape", "arcade", "night", "acid", "paper"] as const;
export type ThemeId = typeof themeIds[number];
export interface ThemeEdition {
  id: ThemeId;
  label: string;
  description: string;
  title: string;
  word: string;
  accent: string;
  companion: string;
  canvas: string;
  deviceTheme: DeviceDisplayConfig["theme"];
}

const edition = (id: ThemeId, label: string, description: string, title: string, word: string,
  accent: string, companion: string, canvas: string, background: string, card: string): ThemeEdition =>
  ({ id, label, description, title, word, accent, companion, canvas,
    deviceTheme: { background, card, accent, dataText: accent } });

export const themeEditions: ThemeEdition[] = [
  edition("signal", "街区信号", "黑灰 × 信号黄", "EVERYDAY SYSTEM", "CONNECTED", "#F5ED00", "#B8BB9E", "#151517", "#131416", "#232426"),
  edition("tape", "磁带暖橙", "暖石墨 × 磁带橙", "TAPE MACHINE", "ANALOG DAYS", "#FFAD48", "#C9BDA0", "#211A17", "#191512", "#302721"),
  edition("arcade", "街机冰蓝", "墨蓝 × 冰蓝 × 明黄", "ARCADE SIGNAL", "PLAY EVERYDAY", "#70DDFF", "#F1DF6C", "#111E29", "#101A22", "#20313E"),
  edition("night", "夜场紫粉", "墨紫 × 粉 × 冷蓝", "NIGHT FREQUENCY", "AFTER HOURS", "#F5A0FF", "#93BDFF", "#21192C", "#1A1422", "#30273B"),
  edition("acid", "酸性青柠", "军灰 × 青柠 × 冷紫", "URBAN CURRENT", "STAY CONNECTED", "#C5F31B", "#BBA2F0", "#1D2419", "#151A11", "#283021"),
  edition("paper", "纸刊朱红", "纸白 × 油墨 × 朱红", "DAILY EDITION", "PRINTED MATTER", "#FF6B55", "#D8C9A4", "#DDD7C8", "#191713", "#2B2721")
];

export interface AppearancePreferences {
  version: 1;
  theme: ThemeId;
  shell: "graphite" | "ivory" | "mixed";
  depth: "a" | "b";
  background: "standard" | "rich";
  motion: "system" | "full" | "reduced";
  paused: boolean;
}
export const appearanceStorageKey = "esp32-monitor.appearance.v1";
export const defaultAppearance: AppearancePreferences = {
  version: 1, theme: "signal", shell: "mixed", depth: "b", background: "rich", motion: "system", paused: false
};

export function normalizeAppearance(value: unknown): AppearancePreferences {
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return { ...defaultAppearance };
  const candidate = value as Record<string, unknown>;
  const oneOf = <T extends string>(key: string, choices: readonly T[], fallback: T): T =>
    choices.includes(candidate[key] as T) ? candidate[key] as T : fallback;
  return {
    version: 1,
    theme: oneOf("theme", themeIds, "signal"),
    shell: oneOf("shell", ["graphite", "ivory", "mixed"], "mixed"),
    depth: oneOf("depth", ["a", "b"], "b"),
    background: oneOf("background", ["standard", "rich"], "rich"),
    motion: oneOf("motion", ["system", "full", "reduced"], "system"),
    paused: candidate.paused === true
  };
}

export function readAppearance(raw: string | null): AppearancePreferences {
  try { return normalizeAppearance(JSON.parse(raw ?? "null")); }
  catch { return { ...defaultAppearance }; }
}

export function getEdition(id: ThemeId): ThemeEdition {
  return themeEditions.find((entry) => entry.id === id) ?? themeEditions[0];
}
