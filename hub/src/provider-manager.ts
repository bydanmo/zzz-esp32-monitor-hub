import type { Metric, ProviderState } from "./types.js";
import type { MetricProvider } from "./providers/provider.js";

type ProviderRuntime = {
  provider: MetricProvider;
  metrics: Metric[];
  state: ProviderState;
  timer: NodeJS.Timeout | null;
  running: boolean;
};

function errorCode(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) || "COLLECT_FAILED";
  }
  return "COLLECT_FAILED";
}

export class ProviderManager {
  private readonly runtimes: ProviderRuntime[];

  constructor(providers: MetricProvider[], private readonly timeoutMs = 1500) {
    this.runtimes = providers.map((provider) => ({
      provider,
      metrics: [],
      timer: null,
      running: false,
      state: {
        id: provider.id,
        label: provider.label,
        status: "waiting",
        lastAttemptAt: null,
        lastSuccessAt: null,
        errorCode: null,
        metricCount: 0
      }
    }));
  }

  async start(): Promise<void> {
    await Promise.all(this.runtimes.map((runtime) => this.run(runtime)));
    for (const runtime of this.runtimes) {
      runtime.timer = setInterval(() => { void this.run(runtime); }, runtime.provider.refreshIntervalMs);
      runtime.timer.unref();
    }
  }

  stop(): void {
    for (const runtime of this.runtimes) {
      if (runtime.timer) clearInterval(runtime.timer);
      runtime.timer = null;
    }
  }

  metrics(): Metric[] {
    const byId = new Map<string, Metric>();
    for (const runtime of this.runtimes) {
      for (const metric of runtime.metrics) byId.set(metric.id, { ...metric });
    }
    return [...byId.values()];
  }

  states(): ProviderState[] {
    return this.runtimes.map((runtime) => ({ ...runtime.state }));
  }

  private async run(runtime: ProviderRuntime): Promise<void> {
    if (runtime.running) return;
    runtime.running = true;
    const attemptedAt = new Date().toISOString();
    runtime.state = { ...runtime.state, lastAttemptAt: attemptedAt };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const metrics = await Promise.race([
        runtime.provider.collect(controller.signal),
        new Promise<Metric[]>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("PROVIDER_TIMEOUT")), { once: true });
        })
      ]);
      runtime.metrics = metrics.map((metric) => ({
        ...metric,
        sourceId: metric.sourceId ?? runtime.provider.id,
        availability: metric.availability ?? "available"
      }));
      runtime.state = {
        ...runtime.state,
        status: "ready",
        lastSuccessAt: new Date().toISOString(),
        errorCode: null,
        metricCount: runtime.metrics.length
      };
    } catch (error) {
      runtime.state = {
        ...runtime.state,
        status: runtime.state.lastSuccessAt ? "degraded" : "failed",
        errorCode: errorCode(error),
        metricCount: runtime.metrics.length
      };
    } finally {
      clearTimeout(timeout);
      runtime.running = false;
    }
  }
}
