import path from "node:path";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { DeviceSessionRegistry } from "./device-sessions.js";
import { StudyBridge } from "./study-bridge.js";
import { pairedStudyHello } from "./study-pairing.js";
import { DeviceHeartbeat, type HeartbeatSocket } from "./device-heartbeat.js";
import { ConfigWriteQueue } from "./config-write-queue.js";
import { loadDeviceConfig, saveDeviceConfig, validateDeviceConfig } from "./device-config.js";
import { collectDeviceTelemetry } from "./device-telemetry.js";
import {
  examSecondsRemaining,
  loadExamTarget,
  saveExamTarget,
  validateExamTarget,
  type ExamTarget
} from "./exam-target.js";
import { collectSnapshot } from "./telemetry.js";
import { ProviderManager } from "./provider-manager.js";
import { HardwareHttpProvider } from "./providers/hardware-http-provider.js";
import type { MetricProvider } from "./providers/provider.js";
import { SystemProvider } from "./providers/system-provider.js";
import type { DeviceDisplayConfig } from "./types.js";

const app = Fastify({ logger: true });
const directory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(directory, "../../web/dist");
const clients = new Set<{ send(data: string): void; readyState: number }>();
const deviceClients = new Set<HeartbeatSocket & { send(data: string): void }>();
const deviceSessions = new DeviceSessionRegistry();
const studyBridge = new StudyBridge(process.env.STUDY_BRIDGE_ENABLED === "1");
const studyControlsPath = path.resolve(directory, "../data/study-controls.json");
let studyPairingKey = "";
const studyControlConnections = new Set<object>();
try {
  const settings = JSON.parse(await readFile(studyControlsPath, "utf8"));
  if (typeof settings.controlKey === "string") studyPairingKey = settings.controlKey;
  studyBridge.setControlsEnabled(settings.enabled === true);
  if (typeof settings.bridgeEnabled === "boolean") studyBridge.setEnabled(settings.bridgeEnabled);
}
catch { /* Device writes stay disabled until explicitly enabled locally. */ }
const deviceHeartbeat = new DeviceHeartbeat((socket) => deviceSessions.markSeen(socket));
const configWrites = new ConfigWriteQueue();
const studySettingsWrites = new ConfigWriteQueue();
const examTargetWrites = new ConfigWriteQueue();
let deviceConfig = await loadDeviceConfig();
let examTarget: ExamTarget = await loadExamTarget();
const providers: MetricProvider[] = [new SystemProvider(Number(process.env.SYSTEM_REFRESH_MS ?? 2000))];
if (process.env.HARDWARE_MONITOR_URL) {
  providers.push(new HardwareHttpProvider(process.env.HARDWARE_MONITOR_URL));
}
const providerManager = new ProviderManager(providers, Number(process.env.PROVIDER_TIMEOUT_MS ?? 7000));
await providerManager.start();

function broadcastDeviceState(snapshot = collectSnapshot(examTarget, providerManager.metrics())) {
  const message = JSON.stringify(collectDeviceTelemetry(snapshot, deviceConfig));
  let pushedDevices = 0;
  const pushedSockets: Array<{ send(data: string): void; readyState: number }> = [];
  for (const client of deviceClients) {
    if (client.readyState !== 1) continue;
    try {
      client.send(message);
      pushedDevices += 1;
      pushedSockets.push(client);
    } catch (error) {
      app.log.warn({ error }, "Failed to push device configuration");
    }
  }
  return { pushedDevices, pushedSockets };
}

await app.register(websocket);
await app.register(fastifyStatic, { root: webRoot, prefix: "/" });

app.get("/api/health", async () => ({
  ok: true,
  service: "esp32-monitor-hub",
  connectedDevices: deviceClients.size,
  identifiedDevices: deviceSessions.list().length
}));
const localRequest = (ip: string) => ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
app.get("/api/study-link", async (request, reply) => {
  if (!localRequest(request.ip)) return reply.code(403).send({ error: "Local settings only" });
  return studyBridge.status();
});
app.put<{ Body: { enabled: boolean; controlsEnabled?: boolean } }>("/api/study-link", { schema: { body: {
  type: "object", required: ["enabled"], additionalProperties: false, properties: { enabled: { type: "boolean" }, controlsEnabled: { type: "boolean" } }
} } }, async (request, reply) => {
  if (!localRequest(request.ip)) return reply.code(403).send({ error: "Local settings only" });
  return studySettingsWrites.run(async () => {
  await mkdir(path.dirname(studyControlsPath), { recursive: true });
  const controls = request.body.controlsEnabled ?? studyBridge.status().controlsEnabled;
  await writeFile(studyControlsPath + ".tmp", JSON.stringify({ enabled: controls, bridgeEnabled: request.body.enabled, controlKey: studyPairingKey }) + "\n");
  await rename(studyControlsPath + ".tmp", studyControlsPath);
  studyBridge.setControlsEnabled(controls);
  studyBridge.setEnabled(request.body.enabled);
  if (request.body.enabled) await studyBridge.tick();
  return studyBridge.status();
  });
});
app.get("/api/snapshot", async () => collectSnapshot(examTarget, providerManager.metrics()));
app.get("/api/devices", async () => ({
  devices: deviceSessions.list(),
  legacyConnections: deviceSessions.legacyConnections()
}));
app.get("/api/providers", async () => ({ providers: providerManager.states() }));
app.get("/api/exam-target", async () => ({
  target: examTarget,
  examSeconds: examSecondsRemaining(examTarget)
}));
app.put<{ Body: unknown }>("/api/exam-target", async (request, reply) => {
  return examTargetWrites.run(async () => {
  try {
    const next = validateExamTarget(request.body);
    await saveExamTarget(next);
    examTarget = next;
    /* The countdown reaches the device through the telemetry frame, so push one
     * now instead of waiting for the next two-second tick. */
    broadcastDeviceState(collectSnapshot(examTarget, providerManager.metrics()));
    return { target: examTarget, examSeconds: examSecondsRemaining(examTarget) };
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : "考试目标无效"
    });
  }
  });
});
app.get("/api/device-config", async () => ({
  config: deviceConfig,
  connectedDevices: deviceClients.size,
  pushedDevices: 0
}));
app.put<{ Body: DeviceDisplayConfig }>("/api/device-config", async (request, reply) => {
  return configWrites.run(async () => {
  try {
    if (!Number.isSafeInteger(request.body?.revision) || request.body.revision < 0) {
      return reply.code(400).send({ error: "配置必须携带有效版本，请先载入 Hub 配置" });
    }
    if (request.body.revision !== deviceConfig.revision) {
      return reply.code(409).send({ error: "Hub 配置已更新，请重新载入远端配置后处理草稿" });
    }
    const next = validateDeviceConfig(request.body, deviceConfig.revision + 1);
    await saveDeviceConfig(next);
    deviceConfig = next;
    const { pushedDevices, pushedSockets } = broadcastDeviceState(
      collectSnapshot(examTarget, providerManager.metrics()));
    deviceSessions.markPushed(next.revision, pushedSockets);
    return { config: deviceConfig, connectedDevices: deviceClients.size, pushedDevices };
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : "配置无效"
    });
  }
  });
});
app.get("/ws", { websocket: true }, (socket) => {
  clients.add(socket);
  socket.send(JSON.stringify({ type: "snapshot", payload: collectSnapshot(examTarget, providerManager.metrics()) }));
  socket.on("close", () => clients.delete(socket));
});
app.get("/device-ws", { websocket: true }, (socket) => {
  deviceClients.add(socket);
  deviceSessions.add(socket);
  socket.send(JSON.stringify(collectDeviceTelemetry(collectSnapshot(examTarget, providerManager.metrics()), deviceConfig)));
  socket.on("message", (data: { toString(): string }) => {
    const raw = data.toString();
    if (deviceSessions.handleMessage(socket, raw)) {
      if (JSON.parse(raw).type === "hello") {
        if (pairedStudyHello(raw, studyPairingKey)) studyControlConnections.add(socket);
        else studyControlConnections.delete(socket);
      }
      studyBridge.register(socket, deviceSessions.supports(socket, "study-v1"),
        deviceSessions.supports(socket, "study-control-v1") && studyControlConnections.has(socket));
    } else if (!studyBridge.handleMessage(socket, raw)) {
      app.log.warn("Ignored invalid device message");
    }
  });
  socket.on("pong", () => deviceHeartbeat.pong(socket));
  socket.on("error", (error: Error) => app.log.warn({ error }, "Device WebSocket error"));
  socket.on("close", () => {
    deviceClients.delete(socket);
    deviceHeartbeat.remove(socket);
    deviceSessions.remove(socket);
    studyControlConnections.delete(socket);
    studyBridge.remove(socket);
  });
});
setInterval(() => {
  const snapshot = collectSnapshot(examTarget, providerManager.metrics());
  const message = JSON.stringify({ type: "snapshot", payload: snapshot });
  for (const client of clients) {
    if (client.readyState === 1) client.send(message);
  }
  broadcastDeviceState(snapshot);
}, 2000).unref();

setInterval(() => deviceHeartbeat.tick(deviceClients), 30000).unref();
setInterval(() => { void studyBridge.tick(); }, 2000).unref();
void studyBridge.tick();

const host = process.env.HUB_HOST ?? "127.0.0.1";
const port = Number(process.env.HUB_PORT ?? 8787);
await app.listen({ host, port });
