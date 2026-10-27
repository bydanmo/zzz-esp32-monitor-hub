import type { ConfigAck, DeviceHello, DeviceSessionView } from "./types.js";

export type DeviceSocket = object;

type RuntimeSession = DeviceSessionView & { socket: DeviceSocket };

const identifier = /^[A-Za-z0-9._-]{1,64}$/;

function isHello(value: unknown): value is DeviceHello {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<DeviceHello>;
  const device = message.device;
  return message.type === "hello" && Number.isInteger(message.protocolVersion) &&
    typeof device === "object" && device !== null && identifier.test(device.id ?? "") &&
    typeof device.model === "string" && device.model.length >= 1 && device.model.length <= 64 &&
    typeof device.firmwareVersion === "string" && device.firmwareVersion.length >= 1 && device.firmwareVersion.length <= 32 &&
    Array.isArray(device.capabilities) && device.capabilities.length <= 16 &&
    device.capabilities.every((capability) => typeof capability === "string" && identifier.test(capability));
}

function isConfigAck(value: unknown): value is ConfigAck {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<ConfigAck>;
  return message.type === "configAck" && identifier.test(message.deviceId ?? "") &&
    Number.isInteger(message.revision) && Number(message.revision) >= 0 &&
    (message.status === "applied" || message.status === "rejected") &&
    (message.reason === undefined || (typeof message.reason === "string" && identifier.test(message.reason)));
}

export class DeviceSessionRegistry {
  private readonly connections = new Set<DeviceSocket>();
  private readonly sessions = new Map<DeviceSocket, RuntimeSession>();

  constructor(private readonly clock = () => new Date()) {}

  add(socket: DeviceSocket): void {
    this.connections.add(socket);
  }

  remove(socket: DeviceSocket): void {
    this.connections.delete(socket);
    this.sessions.delete(socket);
  }

  handleMessage(socket: DeviceSocket, raw: string): boolean {
    if (!this.connections.has(socket) || raw.length === 0 || raw.length >= 512) return false;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return false;
    }
    const now = this.clock().toISOString();
    if (isHello(value)) {
      this.sessions.set(socket, {
        socket,
        id: value.device.id,
        model: value.device.model,
        firmwareVersion: value.device.firmwareVersion,
        protocolVersion: value.protocolVersion,
        capabilities: [...value.device.capabilities],
        connectedAt: now,
        lastSeenAt: now,
        pushedRevision: null,
        appliedRevision: null,
        configState: "connected",
        rejectionReason: null
      });
      return true;
    }
    if (isConfigAck(value)) {
      const session = this.sessions.get(socket);
      if (!session || session.id !== value.deviceId) return false;
      session.lastSeenAt = now;
      if (session.pushedRevision !== null && value.revision < session.pushedRevision) return true;
      if (session.appliedRevision !== null && value.revision < session.appliedRevision) return true;
      session.appliedRevision = value.status === "applied" ? value.revision : session.appliedRevision;
      session.configState = value.status;
      session.rejectionReason = value.status === "rejected" ? value.reason ?? "unspecified" : null;
      return true;
    }
    return false;
  }

  supports(socket: DeviceSocket, capability: string): boolean {
    return this.sessions.get(socket)?.capabilities.includes(capability) ?? false;
  }

  markSeen(socket: DeviceSocket): void {
    const session = this.sessions.get(socket);
    if (session) session.lastSeenAt = this.clock().toISOString();
  }

  markPushed(revision: number, sockets: DeviceSocket[]): void {
    for (const socket of sockets) {
      const session = this.sessions.get(socket);
      if (!session) continue;
      session.pushedRevision = revision;
      session.configState = "pushed";
      session.rejectionReason = null;
    }
  }

  list(): DeviceSessionView[] {
    return [...this.sessions.values()].map(({ socket: _socket, ...session }) => ({
      ...session,
      capabilities: [...session.capabilities]
    })).sort((left, right) => left.id.localeCompare(right.id));
  }

  legacyConnections(): number {
    return this.connections.size - this.sessions.size;
  }
}
