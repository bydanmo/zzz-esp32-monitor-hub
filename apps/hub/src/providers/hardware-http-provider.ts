import type { Metric } from "../types.js";
import type { MetricProvider } from "./provider.js";

type SensorNode = {
  Text?: unknown;
  Value?: unknown;
  Children?: unknown;
};

type SensorValue = { path: string; value: number };

function flatten(node: unknown, parents: string[] = []): SensorValue[] {
  if (typeof node !== "object" || node === null) return [];
  const current = node as SensorNode;
  const text = typeof current.Text === "string" ? current.Text : "";
  const path = [...parents, text].filter(Boolean);
  const parsed = typeof current.Value === "string"
    ? Number.parseFloat(current.Value.replace(",", ".")) : Number.NaN;
  const own = Number.isFinite(parsed) ? [{ path: path.join(" / ").toLowerCase(), value: parsed }] : [];
  const children = Array.isArray(current.Children) ? current.Children.flatMap((child) => flatten(child, path)) : [];
  return [...own, ...children];
}

function find(values: SensorValue[], include: RegExp[]): number | null {
  return values.find((candidate) => include.every((pattern) => pattern.test(candidate.path)))?.value ?? null;
}

export class HardwareHttpProvider implements MetricProvider {
  readonly id = "hardware-http";
  readonly label = "硬件监控服务";
  readonly refreshIntervalMs: number;

  constructor(private readonly url: string, refreshIntervalMs = 2000) {
    this.refreshIntervalMs = refreshIntervalMs;
  }

  async collect(signal: AbortSignal): Promise<Metric[]> {
    const response = await fetch(this.url, { signal });
    if (!response.ok) throw new Error(`HARDWARE_HTTP_${response.status}`);
    const values = flatten(await response.json());
    const now = new Date().toISOString();
    const definitions = [
      ["system.cpu.temperature", "CPU 温度", "°C", [/cpu/i, /temperature/i, /(package|core|max)/i]],
      ["system.gpu", "GPU", "%", [/gpu/i, /load/i, /(core|gpu)/i]],
      ["system.gpu.temperature", "GPU 温度", "°C", [/gpu/i, /temperature/i, /(core|gpu|hot spot)/i]]
    ] as const;
    const metrics: Metric[] = [];
    for (const [id, title, unit, patterns] of definitions) {
      const value = find(values, [...patterns]);
      if (value !== null) metrics.push({ id, title, unit, type: "gauge", value, updatedAt: now });
    }
    if (metrics.length === 0) throw new Error("NO_SUPPORTED_SENSORS");
    return metrics;
  }
}
