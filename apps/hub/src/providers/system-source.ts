/** Minimal collector contract, shared by native Windows and portable backends. */
export interface SystemSource {
  currentLoad(): Promise<{ currentLoad: number | null }>;
  mem(): Promise<{ total: number; available: number }>;
  cpuTemperature(): Promise<{ main: number | null }>;
  graphics(): Promise<{ controllers: Array<{ utilizationGpu?: number; temperatureGpu?: number }> }>;
  fsSize(): Promise<Array<{ mount: string; use: number }>>;
  networkStats(): Promise<Array<{ iface: string; operstate: string; rx_sec: number | null; tx_sec: number | null }>>;
}
