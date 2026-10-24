import os from "node:os";
import si from "systeminformation";
import type { Metric } from "../types.js";
import type { MetricProvider } from "./provider.js";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function metric(id: string, title: string, value: number | string | null, unit: string | undefined,
                updatedAt: string, availability: Metric["availability"] = "available"): Metric {
  return { id, type: "gauge", title, value, unit, updatedAt, availability };
}

export class SystemProvider implements MetricProvider {
  readonly id = "systeminformation";
  readonly label = "本机系统信息";
  readonly refreshIntervalMs: number;

  constructor(refreshIntervalMs = 2000) {
    this.refreshIntervalMs = refreshIntervalMs;
  }

  async collect(signal: AbortSignal): Promise<Metric[]> {
    const now = new Date().toISOString();
    const [load, memory, temperature, graphics, filesystems, networks] = await Promise.allSettled([
      si.currentLoad(), si.mem(), si.cpuTemperature(), si.graphics(), si.fsSize(), si.networkStats()
    ]);
    if (signal.aborted) throw new Error("PROVIDER_TIMEOUT");

    const totalMemory = memory.status === "fulfilled" && finite(memory.value.total)
      ? memory.value.total : os.totalmem();
    const availableMemory = memory.status === "fulfilled" && finite(memory.value.available)
      ? memory.value.available : os.freemem();
    const cpu = load.status === "fulfilled" && finite(load.value.currentLoad)
      ? load.value.currentLoad : null;
    const metrics: Metric[] = [
      metric("system.cpu", "CPU", cpu, "%", now, cpu === null ? "unavailable" : "available"),
      metric("system.memory", "内存", totalMemory > 0 ? ((totalMemory - availableMemory) / totalMemory) * 100 : null,
        "%", now, totalMemory > 0 ? "available" : "unavailable"),
      { id: "system.host", type: "text", title: "主机", value: os.hostname(), updatedAt: now },
      { id: "system.uptime", type: "text", title: "运行时长", value: `${Math.floor(os.uptime() / 3600)} 小时`, updatedAt: now }
    ];

    const cpuTemperature = temperature.status === "fulfilled" && finite(temperature.value.main) && temperature.value.main > 0
      ? temperature.value.main : null;
    metrics.push(metric("system.cpu.temperature", "CPU 温度", cpuTemperature, "°C", now,
      cpuTemperature === null ? "unsupported" : "available"));

    const controllers = graphics.status === "fulfilled" ? graphics.value.controllers : [];
    const gpu = controllers.find((controller) => finite(controller.utilizationGpu)) ?? controllers[0];
    const gpuUsage = gpu && finite(gpu.utilizationGpu) ? gpu.utilizationGpu : null;
    const gpuTemperature = gpu && finite(gpu.temperatureGpu) && gpu.temperatureGpu > 0 ? gpu.temperatureGpu : null;
    metrics.push(metric("system.gpu", "GPU", gpuUsage, "%", now,
      gpuUsage === null ? "unsupported" : "available"));
    metrics.push(metric("system.gpu.temperature", "GPU 温度", gpuTemperature, "°C", now,
      gpuTemperature === null ? "unsupported" : "available"));

    const disks = filesystems.status === "fulfilled" ? filesystems.value : [];
    const systemDrive = (process.env.SystemDrive ?? "C:").toUpperCase();
    const disk = disks.find((item) => item.mount.toUpperCase().startsWith(systemDrive)) ?? disks[0];
    const diskUsage = disk && finite(disk.use) ? disk.use : null;
    metrics.push(metric("system.disk", "磁盘占用", diskUsage, "%", now,
      diskUsage === null ? "unavailable" : "available"));

    const interfaces = networks.status === "fulfilled" ? networks.value : [];
    const network = interfaces.find((item) => item.operstate === "up" && item.iface.toLowerCase() !== "lo") ?? interfaces[0];
    const download = network && finite(network.rx_sec) ? network.rx_sec : null;
    const upload = network && finite(network.tx_sec) ? network.tx_sec : null;
    const networkAvailability = network && (download === null || upload === null) ? "waiting" : network ? "available" : "unavailable";
    metrics.push(metric("system.network.download", "下载速率", download, "B/s", now, networkAvailability));
    metrics.push(metric("system.network.upload", "上传速率", upload, "B/s", now, networkAvailability));
    return metrics;
  }
}
