export interface Metric {
  id: string;
  type: "gauge" | "text" | "status" | "progress" | "countdown";
  title: string;
  value: number | string | null;
  unit?: string;
  updatedAt: string;
  sourceId?: string;
  availability?: "available" | "waiting" | "unsupported" | "unavailable";
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

export interface DeviceConfigResponse {
  config: DeviceDisplayConfig;
  connectedDevices: number;
  pushedDevices: number;
}

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
  configState: "connected" | "pushed" | "applied" | "rejected";
  rejectionReason: string | null;
}

export interface DevicesResponse {
  devices: DeviceSessionView[];
  legacyConnections: number;
}

export interface ProviderState {
  id: string;
  label: string;
  status: "waiting" | "ready" | "degraded" | "failed" | "disabled";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  errorCode: string | null;
  metricCount: number;
}

export interface ProvidersResponse {
  providers: ProviderState[];
}

export interface ExamTargetResponse {
  target: {
    examAt: string | null;
  };
  examSeconds: number | null;
}
