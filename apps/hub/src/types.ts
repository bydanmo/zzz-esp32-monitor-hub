export type MetricKind = "gauge" | "text" | "status" | "progress" | "countdown";
export type MetricAvailability = "available" | "waiting" | "unsupported" | "unavailable";

export interface Metric {
  id: string;
  type: MetricKind;
  title: string;
  value: number | string | null;
  unit?: string;
  trend?: "up" | "down" | "flat";
  updatedAt: string;
  sourceId?: string;
  availability?: MetricAvailability;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  metricIds: string[];
}

export interface Snapshot {
  version: 1;
  deviceTime: string;
  metrics: Metric[];
  dashboards: Dashboard[];
}

export type DevicePage = "overview" | "system" | "study";

export interface DeviceScene {
  id: string;
  name: string;
  page: DevicePage;
  durationSeconds: number;
  enabled: boolean;
  visible: {
    cpu: boolean;
    memory: boolean;
    exam: boolean;
  };
}

export interface DeviceDisplayConfig {
  schemaVersion: 2;
  revision: number;
  title: string;
  activeSceneId: string;
  scenes: DeviceScene[];
  page: DevicePage;
  theme: {
    background: string;
    card: string;
    accent: string;
    dataText: string;
  };
  visible: {
    cpu: boolean;
    memory: boolean;
    exam: boolean;
  };
}

export interface LegacyDeviceDisplayConfig {
  schemaVersion: 1;
  revision: number;
  title: string;
  page: DevicePage;
  theme: DeviceDisplayConfig["theme"];
  visible: DeviceDisplayConfig["visible"];
}

export interface DeviceHello {
  type: "hello";
  protocolVersion: number;
  device: {
    id: string;
    model: string;
    firmwareVersion: string;
    capabilities: string[];
  };
}

export interface ConfigAck {
  type: "configAck";
  deviceId: string;
  revision: number;
  status: "applied" | "rejected";
  reason?: string;
}

export type DeviceConfigState = "connected" | "pushed" | "applied" | "rejected";

export interface DeviceSessionView {
  id: string;
  model: string;
  firmwareVersion: string;
  protocolVersion: number;
  capabilities: string[];
  connectedAt: string;
  lastSeenAt: string;
  pushedRevision: number | null;
  appliedRevision: number | null;
  configState: DeviceConfigState;
  rejectionReason: string | null;
}

export type ProviderStatus = "waiting" | "ready" | "degraded" | "failed" | "disabled";

export interface ProviderState {
  id: string;
  label: string;
  status: ProviderStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  errorCode: string | null;
  metricCount: number;
}
