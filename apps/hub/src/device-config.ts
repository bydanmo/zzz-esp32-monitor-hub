import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DeviceDisplayConfig,
  DevicePage,
  DeviceScene,
  LegacyDeviceDisplayConfig
} from "./types.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(directory, "../data");
const configPath = path.join(dataDirectory, "device-config.json");
const temporaryPath = path.join(dataDirectory, "device-config.tmp.json");
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const sceneIdPattern = /^[a-z0-9][a-z0-9-]{0,23}$/;
const supportedChineseGlyphs =
  "监控屏连接中已在线重离正启刚更新数据延迟过期暂无异常等待考研倒计时" +
  "内存未用系统指标详情再次点击状态返回关闭没有可显示的请网页调整天目标间到" +
  "估算总览学习";

export const defaultDeviceConfig: DeviceDisplayConfig = {
  schemaVersion: 2,
  revision: 1,
  title: "ESP32 监控屏",
  activeSceneId: "overview",
  scenes: [
    { id: "overview", name: "总览", page: "overview", durationSeconds: 30, enabled: true,
      visible: { cpu: true, memory: true, exam: true } },
    { id: "system", name: "系统", page: "system", durationSeconds: 30, enabled: true,
      visible: { cpu: true, memory: true, exam: false } },
    { id: "study", name: "学习", page: "study", durationSeconds: 30, enabled: true,
      visible: { cpu: false, memory: false, exam: true } }
  ],
  page: "overview",
  theme: {
    background: "#0D131B",
    card: "#17212D",
    accent: "#63D8C5",
    dataText: "#F2F6FA"
  },
  visible: { cpu: true, memory: true, exam: true }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateVisible(input: unknown): DeviceDisplayConfig["visible"] {
  if (!isRecord(input) || typeof input.cpu !== "boolean" ||
      typeof input.memory !== "boolean" || typeof input.exam !== "boolean") {
    throw new Error("指标显隐值无效");
  }
  const visible = { cpu: input.cpu, memory: input.memory, exam: input.exam };
  if (!visible.cpu && !visible.memory && !visible.exam) {
    throw new Error("至少保留一个显示指标");
  }
  return visible;
}

function validatePage(input: unknown): DevicePage {
  if (input !== "overview" && input !== "system" && input !== "study") {
    throw new Error("未知的页面类型");
  }
  return input;
}

function validatePageContent(page: DevicePage, visible: DeviceDisplayConfig["visible"]): void {
  if ((page === "system" && !visible.cpu && !visible.memory) ||
      (page === "study" && !visible.exam)) {
    throw new Error("场景页面至少需要一个可显示指标");
  }
}

function legacyScenes(page: DevicePage, visible: DeviceDisplayConfig["visible"]): DeviceScene[] {
  const scenes = structuredClone(defaultDeviceConfig.scenes);
  const active = scenes.find((scene) => scene.id === page) ?? scenes[0];
  active.visible = visible;
  validatePageContent(active.page, active.visible);
  return scenes;
}

function validateScenes(input: unknown): DeviceScene[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) {
    throw new Error("场景数量必须为 1–8 个");
  }
  const ids = new Set<string>();
  const scenes = input.map((candidate): DeviceScene => {
    if (!isRecord(candidate)) throw new Error("场景结构不完整");
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!sceneIdPattern.test(id) || ids.has(id)) throw new Error("场景 ID 无效或重复");
    ids.add(id);
    if (Array.from(name).length < 1 || Array.from(name).length > 20 || /[\u0000-\u001F]/.test(name)) {
      throw new Error("场景名称必须为 1–20 个可显示字符");
    }
    const page = validatePage(candidate.page);
    const visible = validateVisible(candidate.visible);
    validatePageContent(page, visible);
    if (!Number.isInteger(candidate.durationSeconds) ||
        (candidate.durationSeconds as number) < 10 || (candidate.durationSeconds as number) > 3600) {
      throw new Error("场景停留时间必须为 10–3600 秒的整数");
    }
    if (typeof candidate.enabled !== "boolean") throw new Error("场景启用状态无效");
    return { id, name, page, visible, enabled: candidate.enabled,
      durationSeconds: candidate.durationSeconds as number };
  });
  if (!scenes.some((scene) => scene.enabled)) throw new Error("至少启用一个场景");
  return scenes;
}

export function validateDeviceConfig(input: unknown, revision: number): DeviceDisplayConfig {
  if (!isRecord(input) || !isRecord(input.theme) || !isRecord(input.visible)) {
    throw new Error("配置结构不完整");
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const titleCharacters = Array.from(title);
  if (titleCharacters.length < 1 || titleCharacters.length > 12 ||
      Buffer.byteLength(title, "utf8") > 48 ||
      !titleCharacters.every((character) =>
        /^[\x20-\x7E]$/.test(character) || supportedChineseGlyphs.includes(character))) {
    throw new Error("标题必须为 1–12 个设备字库支持的字符，且不超过 48 个 UTF-8 字节");
  }
  const background = input.theme.background;
  const card = input.theme.card;
  const accent = input.theme.accent;
  const dataText = input.theme.dataText ?? defaultDeviceConfig.theme.dataText;
  if (typeof background !== "string" || typeof card !== "string" ||
      typeof accent !== "string" || typeof dataText !== "string" ||
      !colorPattern.test(background) || !colorPattern.test(card) ||
      !colorPattern.test(accent) || !colorPattern.test(dataText)) {
    throw new Error("主题颜色必须使用 #RRGGBB 格式");
  }
  const legacyPage = validatePage(input.page);
  const legacyVisible = validateVisible(input.visible);
  validatePageContent(legacyPage, legacyVisible);
  const scenes = input.schemaVersion === 2 ? validateScenes(input.scenes) : legacyScenes(legacyPage, legacyVisible);
  const activeSceneId = input.schemaVersion === 2 && typeof input.activeSceneId === "string"
    ? input.activeSceneId : legacyPage;
  const activeScene = scenes.find((scene) => scene.id === activeSceneId);
  if (!activeScene || !activeScene.enabled) throw new Error("当前场景必须存在且已启用");
  return {
    schemaVersion: 2,
    revision,
    title,
    activeSceneId,
    scenes,
    page: activeScene.page,
    theme: {
      background: background.toUpperCase(),
      card: card.toUpperCase(),
      accent: accent.toUpperCase(),
      dataText: dataText.toUpperCase()
    },
    visible: activeScene.visible
  };
}

export function projectDeviceConfig(config: DeviceDisplayConfig): LegacyDeviceDisplayConfig {
  return {
    schemaVersion: 1,
    revision: config.revision,
    title: config.title,
    page: config.page,
    theme: config.theme,
    visible: config.visible
  };
}

export async function loadDeviceConfig(): Promise<DeviceDisplayConfig> {
  try {
    const stored = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    const revision = isRecord(stored) && typeof stored.revision === "number" ? stored.revision : 1;
    return validateDeviceConfig(stored, revision);
  } catch {
    return structuredClone(defaultDeviceConfig);
  }
}

export async function saveDeviceConfig(config: DeviceDisplayConfig): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temporaryPath, configPath);
}
