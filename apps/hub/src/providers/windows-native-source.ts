import os from "node:os";
import path from "node:path";
import { statfs } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import koffi, { type LibraryHandle } from "koffi";
import type { SystemSource } from "./system-source.js";

type NativeFunction = ReturnType<LibraryHandle["func"]>;

function call(fn: NativeFunction, ...args: unknown[]): Promise<number> {
  return new Promise((resolve, reject) => {
    fn.async(...args, (error: Error | null, result: number) => error ? reject(error) : resolve(result));
  });
}

export type NetworkCounters = { index: number; received: bigint; sent: bigint };

/** Interface switches, disconnects and counter resets start a new baseline. */
export class NetworkRateTracker {
  private previous: (NetworkCounters & { at: number }) | undefined;

  update(current: NetworkCounters | null, at: number): { download: number | null; upload: number | null } {
    const before = this.previous;
    this.previous = current ? { ...current, at } : undefined;
    if (!current || !before || current.index !== before.index || at <= before.at ||
        current.received < before.received || current.sent < before.sent) {
      return { download: null, upload: null };
    }
    const seconds = (at - before.at) / 1000;
    return {
      download: Number(current.received - before.received) / seconds,
      upload: Number(current.sent - before.sent) / seconds
    };
  }
}

function networkBindings() {
  // Fixed-width fields and natural alignment match netioapi.h on Windows x64/ARM64.
  const guid = koffi.struct({ Data1: "uint32", Data2: "uint16", Data3: "uint16", Data4: "uint8[8]" });
  const row = koffi.struct({
    InterfaceLuid: "uint64", InterfaceIndex: "uint32", InterfaceGuid: guid,
    Alias: "uint16[257]", Description: "uint16[257]",
    PhysicalAddressLength: "uint32", PhysicalAddress: "uint8[32]", PermanentPhysicalAddress: "uint8[32]",
    Mtu: "uint32", Type: "uint32", TunnelType: "int32", MediaType: "int32", PhysicalMediumType: "int32",
    AccessType: "int32", DirectionType: "int32", InterfaceAndOperStatusFlags: "uint8",
    OperStatus: "int32", AdminStatus: "int32", MediaConnectState: "int32", NetworkGuid: guid,
    ConnectionType: "int32", TransmitLinkSpeed: "uint64", ReceiveLinkSpeed: "uint64",
    InOctets: "uint64", InUcastPkts: "uint64", InNUcastPkts: "uint64", InDiscards: "uint64",
    InErrors: "uint64", InUnknownProtos: "uint64", InUcastOctets: "uint64", InMulticastOctets: "uint64",
    InBroadcastOctets: "uint64", OutOctets: "uint64", OutUcastPkts: "uint64", OutNUcastPkts: "uint64",
    OutDiscards: "uint64", OutErrors: "uint64", OutUcastOctets: "uint64", OutMulticastOctets: "uint64",
    OutBroadcastOctets: "uint64", OutQLen: "uint64"
  });
  if (koffi.sizeof(row) !== 1352 || koffi.offsetof(row, "InOctets") !== 1208) {
    throw new Error("WINDOWS_NETWORK_ABI_MISMATCH");
  }
  const library = koffi.load(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "iphlpapi.dll"));
  return {
    bestInterface: library.func("__stdcall", "GetBestInterface", "uint32", ["uint32", koffi.out(koffi.pointer("uint32"))]),
    getEntry: library.func("__stdcall", "GetIfEntry2", "uint32", [koffi.inout(koffi.pointer(row))])
  };
}

type GpuReader = () => Promise<{ controllers: Array<{ utilizationGpu?: number; temperatureGpu?: number }> }>;

async function nvidiaReader(): Promise<GpuReader> {
  // Absolute driver path prevents loading DLLs from the working directory or PATH.
  const library = koffi.load(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "nvml.dll"));
  const init = library.func("int nvmlInit_v2()");
  const shutdown = library.func("int nvmlShutdown()");
  const getCount = library.func("int nvmlDeviceGetCount_v2(_Out_ uint32 *count)");
  const getDevice = library.func("int nvmlDeviceGetHandleByIndex_v2(uint32 index, _Out_ void **device)");
  const utilization = koffi.struct({ gpu: "uint32", memory: "uint32" });
  const getUtilization = library.func("nvmlDeviceGetUtilizationRates", "int", ["void *", koffi.out(koffi.pointer(utilization))]);
  const getTemperature = library.func("int nvmlDeviceGetTemperature(void *device, uint32 sensor, _Out_ uint32 *temperature)");
  if (await call(init) !== 0) throw new Error("NVML_INIT_FAILED");
  process.once("exit", () => { shutdown(); });
  const count = [0];
  if (await call(getCount, count) !== 0 || count[0] < 1) throw new Error("NVML_NO_DEVICE");
  // First accessible NVIDIA device, rather than repeatedly enumerating all displays.
  const device: unknown[] = [null];
  let found = false;
  for (let index = 0; index < count[0]; index += 1) {
    if (await call(getDevice, index, device) === 0) { found = true; break; }
  }
  if (!found) throw new Error("NVML_NO_ACCESSIBLE_DEVICE");
  return async () => {
    const usage = { gpu: 0, memory: 0 };
    const temperature = [0];
    const [usageResult, temperatureResult] = await Promise.all([
      call(getUtilization, device[0], usage), call(getTemperature, device[0], 0, temperature)
    ]);
    return { controllers: [{
      utilizationGpu: usageResult === 0 ? usage.gpu : undefined,
      temperatureGpu: temperatureResult === 0 ? temperature[0] : undefined
    }] };
  };
}

/** No PowerShell, WMI, nvidia-smi, or other child process is used by this backend. */
export class WindowsNativeSource implements SystemSource {
  private previousCpu = os.cpus();
  private readonly rates = new NetworkRateTracker();
  private network: ReturnType<typeof networkBindings> | undefined;
  private gpu: Promise<GpuReader> | undefined;

  async currentLoad() {
    const current = os.cpus();
    let idle = 0;
    let total = 0;
    for (let index = 0; index < current.length; index += 1) {
      const now = current[index].times;
      const before = this.previousCpu[index]?.times ?? now;
      idle += now.idle - before.idle;
      total += Object.values(now).reduce((sum, value) => sum + value, 0)
        - Object.values(before).reduce((sum, value) => sum + value, 0);
    }
    this.previousCpu = current;
    return { currentLoad: total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : null };
  }

  async mem() { return { total: os.totalmem(), available: os.freemem() }; }

  async cpuTemperature() { return { main: null }; }

  async graphics() {
    // Cache failed driver discovery, too. Unsupported hardware never falls back to WMI.
    this.gpu ??= nvidiaReader().catch(() => async () => ({ controllers: [] }));
    return (await this.gpu)();
  }

  async fsSize() {
    const mount = `${process.env.SystemDrive || "C:"}\\`;
    const stats = await statfs(mount);
    return stats.blocks > 0 ? [{ mount, use: (1 - stats.bfree / stats.blocks) * 100 }] : [];
  }

  async networkStats() {
    this.network ??= networkBindings();
    const index = [0];
    // Route-table lookup only: this does not send a packet to 1.1.1.1.
    if (await call(this.network.bestInterface, 0x01010101, index) !== 0) {
      this.rates.update(null, performance.now());
      return [];
    }
    const row = { InterfaceIndex: index[0], InterfaceLuid: 0, OperStatus: 0, InOctets: 0n, OutOctets: 0n };
    if (await call(this.network.getEntry, row) !== 0 || row.OperStatus !== 1) {
      this.rates.update(null, performance.now());
      return [];
    }
    const rates = this.rates.update({ index: index[0], received: BigInt(row.InOctets), sent: BigInt(row.OutOctets) }, performance.now());
    return [{ iface: String(index[0]), operstate: "up", rx_sec: rates.download, tx_sec: rates.upload }];
  }
}
