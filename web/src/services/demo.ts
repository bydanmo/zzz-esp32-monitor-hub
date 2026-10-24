import type { Snapshot } from "../types";

/** Explicit, isolated sample data. Never represents a Hub or hardware session. */
export function isDemoMode(search = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("mode") === "demo";
}

export function demoSnapshot(now = Date.now()): Snapshot {
  const at = new Date(now).toISOString();
  const phase = now / 7000;
  const samples: Array<[string, string, number, string]> = [
    ["system.cpu", "CPU（示例）", 44 + Math.sin(phase) * 23, "%"],
    ["system.memory", "内存（示例）", 52 + Math.sin(phase / 3) * 4, "%"],
    ["system.gpu", "GPU（示例）", 35 + Math.sin(phase / 2) * 15, "%"],
    ["system.disk", "磁盘（示例）", 61, "%"],
    ["system.cpu.temperature", "CPU 温度（示例）", 56 + Math.sin(phase) * 7, "°C"],
    ["system.gpu.temperature", "GPU 温度（示例）", 49 + Math.sin(phase / 2) * 5, "°C"],
    ["system.network.download", "下载（示例）", 3000000 + Math.sin(phase) * 1500000, "B/s"],
    ["system.network.upload", "上传（示例）", 120000 + Math.sin(phase) * 60000, "B/s"],
    ["study.exam", "倒计时（示例）", 428 * 86400 + 3600 - Math.floor(now / 1000) % 3600, "秒"]
  ];
  return {
    version: 1, deviceTime: at,
    metrics: [
      ...samples.map(([id, title, value, unit]) => ({ id, title, value: Math.round(value), unit,
        type: id === "study.exam" ? "countdown" as const : "gauge" as const, updatedAt: at })),
      { id: "system.host", title: "示例主机", value: "DEMO · 示例数据", type: "text", updatedAt: at }
    ],
    dashboards: [{ id: "demo", name: "演示仪表", description: "明确标注的示例数据，不连接硬件", metricIds: samples.map(item => item[0]) }]
  };
}

export function assertLiveMode(): void {
  if (isDemoMode()) throw new Error("演示模式为只读，不会写入真实 Hub 或设备。请返回实时监控后操作。");
}
