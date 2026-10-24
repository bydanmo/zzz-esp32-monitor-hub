import os from "node:os";
import { examSecondsRemaining, type ExamTarget } from "./exam-target.js";
import type { Dashboard, Metric, Snapshot } from "./types.js";

let previousCpu = os.cpus();

function cpuPercent(): number {
  const current = os.cpus();
  let idle = 0;
  let total = 0;
  for (let index = 0; index < current.length; index += 1) {
    const now = current[index].times;
    const before = previousCpu[index]?.times ?? now;
    const nowTotal = Object.values(now).reduce((sum, value) => sum + value, 0);
    const beforeTotal = Object.values(before).reduce((sum, value) => sum + value, 0);
    idle += now.idle - before.idle;
    total += nowTotal - beforeTotal;
  }
  previousCpu = current;
  return total === 0 ? 0 : Number((((total - idle) / total) * 100).toFixed(1));
}

export function collectSnapshot(examTarget: ExamTarget, providerMetrics: Metric[] = []): Snapshot {
  const now = new Date();
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();
  const baseMetrics: Metric[] = [
    { id: "system.cpu", type: "gauge", title: "CPU", value: cpuPercent(), unit: "%", updatedAt: now.toISOString() },
    { id: "system.memory", type: "gauge", title: "内存", value: Number(((usedMemory / totalMemory) * 100).toFixed(1)), unit: "%", updatedAt: now.toISOString() },
    { id: "system.host", type: "text", title: "主机", value: os.hostname(), updatedAt: now.toISOString() },
    { id: "system.uptime", type: "text", title: "运行时长", value: `${Math.floor(os.uptime() / 3600)} 小时`, updatedAt: now.toISOString() }
  ];
  const metricsById = new Map(baseMetrics.map((metric) => [metric.id, metric]));
  for (const metric of providerMetrics) metricsById.set(metric.id, metric);
  const metrics = [...metricsById.values()];
  /* No configured target means no countdown metric at all: the device and the Web
   * console then show 未提供 instead of a number nobody can trust. */
  const examSeconds = examSecondsRemaining(examTarget, now);
  if (examSeconds !== null) {
    metrics.push({ id: "study.exam", type: "countdown", title: "考研倒计时", value: examSeconds, unit: "秒", updatedAt: now.toISOString() });
  }
  const dashboards: Dashboard[] = [
    { id: "system", name: "系统监控", description: "本机资源与状态", metricIds: metrics.filter((metric) => metric.id.startsWith("system.")).map((metric) => metric.id) },
    { id: "study", name: "学习面板", description: "考研与专注数据", metricIds: ["study.exam"] }
  ];
  return { version: 1, deviceTime: now.toISOString(), metrics, dashboards };
}
