import type { Metric } from "../types.js";

export interface MetricProvider {
  readonly id: string;
  readonly label: string;
  readonly refreshIntervalMs: number;
  collect(signal: AbortSignal): Promise<Metric[]>;
}
