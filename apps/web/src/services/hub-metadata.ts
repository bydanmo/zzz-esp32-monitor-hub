import { fetchDeviceConfig, fetchDevices, fetchExamTarget, fetchProviders } from "./hub-api";

/** A failed resource must not discard successful reads. Every refresh retries all
 * metadata, including an exam target that was unavailable during startup. */
export async function fetchHubMetadata(signal?: AbortSignal) {
  const [config, devices, providers, examTarget] = await Promise.allSettled([
    fetchDeviceConfig(signal),
    fetchDevices(signal),
    fetchProviders(signal),
    fetchExamTarget(signal)
  ]);
  return { config, devices, providers, examTarget };
}
