import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "../components/StatusBadge";
import { AppearanceBar } from "../components/AppearanceBar";
import { RetroBackground } from "../components/RetroBackground";
import { getEdition } from "../design/appearance";
import { useAppearance } from "../design/use-appearance";
import { ConnectionsView } from "../features/connections/ConnectionsView";
import { DataOverview } from "../features/overview/DataOverview";
import { ScreenEditor } from "../features/screen-editor/ScreenEditor";
import { fetchDeviceConfig, fetchDevices, fetchExamTarget, fetchProviders, fetchSnapshot } from "../services/hub-api";
import { connectSnapshotSocket } from "../services/snapshot-socket";
import { defaultDeviceConfig, normalizeDeviceConfig } from "../state/default-config";
import {
  createDraftState,
  draftStorageKey as realDraftStorageKey,
  isDraftDirty,
  receiveRemote,
  type DraftState
} from "../state/draft-store";
import type { HubConnectionState } from "../state/ui-state";
import type {
  DeviceConfigResponse,
  DeviceDisplayConfig,
  DeviceSessionView,
  ExamTargetResponse,
  ProviderState,
  Snapshot
} from "../types";

import { isDemoMode } from "../services/demo";

const demo = isDemoMode();
const draftStorageKey = demo ? "zzz-demo-draft-v1" : realDraftStorageKey;

type View = "overview" | "editor" | "connections";

function isConfig(value: unknown): value is DeviceDisplayConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (candidate.schemaVersion === 1 || candidate.schemaVersion === 2) &&
    typeof candidate.revision === "number" && typeof candidate.title === "string" &&
    Boolean(candidate.theme) && Boolean(candidate.visible) &&
    (candidate.schemaVersion === 1 ||
      (Array.isArray(candidate.scenes) && typeof candidate.activeSceneId === "string"));
}

function normalizeConfig(config: DeviceDisplayConfig): DeviceDisplayConfig {
  return normalizeDeviceConfig(config);
}

function restoreDraft(): DraftState {
  try {
    const stored = JSON.parse(localStorage.getItem(draftStorageKey) ?? "null") as {
      base?: unknown;
      draft?: unknown;
    } | null;
    if (stored && isConfig(stored.base) && isConfig(stored.draft)) {
      return {
        base: normalizeConfig(stored.base),
        draft: normalizeConfig(stored.draft),
        conflict: null,
        status: "已恢复本地草稿"
      };
    }
  } catch {
    try { localStorage.removeItem(draftStorageKey); } catch { /* Storage may be disabled. */ }
  }
  return createDraftState(defaultDeviceConfig);
}

export function App() {
  const { preferences, setPreferences, reduced, storageNotice } = useAppearance();
  const edition = getEdition(preferences.theme);
  const [view, setView] = useState<View>("overview");
  const [now, setNow] = useState(Date.now);
  const [remoteReady, setRemoteReady] = useState(false);
  const [apiError, setApiError] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<HubConnectionState>("connecting");
  const [connectedDevices, setConnectedDevices] = useState(0);
  const [devices, setDevices] = useState<DeviceSessionView[]>([]);
  const [legacyConnections, setLegacyConnections] = useState(0);
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [examTarget, setExamTarget] = useState<ExamTargetResponse | null>(null);
  const [draftState, setDraftState] = useState<DraftState>(restoreDraft);

  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  const acceptServerState = useCallback((response: DeviceConfigResponse) => {
    setRemoteReady(!demo);
    setConnectedDevices(response.connectedDevices);
    setDraftState((current) => receiveRemote(current, response.config));
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [nextSnapshot, config, deviceResponse, providerResponse, examTargetResponse] = await Promise.all([
      fetchSnapshot(signal),
      fetchDeviceConfig(signal),
      fetchDevices(signal),
      fetchProviders(signal),
      fetchExamTarget(signal)
    ]);
    setSnapshot(nextSnapshot);
    setDevices(deviceResponse.devices);
    setLegacyConnections(deviceResponse.legacyConnections);
    setProviders(providerResponse.providers);
    setExamTarget(examTargetResponse);
    acceptServerState(config);
    setApiError("");
  }, [acceptServerState]);

  useEffect(() => connectSnapshotSocket(
    setSnapshot,
    setConnection,
    () => { void refresh().catch(() => setApiError("部分配置暂时无法读取，已有数据与草稿已保留")); }
  ), [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted) setApiError("正在等待 Hub 的配置与数据源信息");
    });
    const timer = window.setInterval(() => {
      void Promise.all([
        fetchDeviceConfig(controller.signal), fetchDevices(controller.signal), fetchProviders(controller.signal)
      ]).then(([config, deviceResponse, providerResponse]) => {
        acceptServerState(config);
        setDevices(deviceResponse.devices);
        setLegacyConnections(deviceResponse.legacyConnections);
        setProviders(providerResponse.providers);
        setApiError("");
      }).catch(() => undefined);
    }, 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [acceptServerState, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try { if (isDraftDirty(draftState)) {
      localStorage.setItem(draftStorageKey, JSON.stringify({
        base: draftState.base,
        draft: draftState.draft
      }));
    } else {
      localStorage.removeItem(draftStorageKey);
    } } catch { /* A blocked browser store must not interrupt live telemetry. */ }
  }, [draftState]);

  const snapshotTime = snapshot ? Date.parse(snapshot.deviceTime) : NaN;
  const age = Number.isFinite(snapshotTime) ? Math.max(0, Math.floor((now - snapshotTime) / 1000)) : null;
  const snapshotLabel = demo ? "演示数据 · 非真实主机或设备" : age === null ? "等待首份快照" : `${age < 2 ? "刚刚更新" : age + " 秒前更新"}${connection === "online" ? "" : " · 保留最后快照"}`;
  return <main className={`app-shell app-view-${view} ${reduced ? "reduced-motion" : "motion-override"} ${preferences.paused ? "background-paused" : ""}`}
    data-theme={preferences.theme} data-shell={preferences.shell} data-depth={preferences.depth} data-background={preferences.background}>
    <RetroBackground edition={edition} />
      <header className="app-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true">DM<span>01</span></span><div className="brand-copy"><b>桌面终端</b><small>DESK MONITOR / LOCAL HUB</small></div></div>
        <nav className="view-nav" aria-label="控制台功能">{([
          ["overview", "数据总览"], ["editor", "屏幕编辑"], ["connections", "连接与数据源"]
        ] as const).map(([target, label]) => <button type="button" key={target} className={view === target ? "view-button is-active" : "view-button"} aria-current={view === target ? "page" : undefined} onClick={() => setView(target)}>{label}</button>)}</nav>
        {demo ? <span className="status-badge">演示模式 · 只读</span> : <StatusBadge state={connection} />}
      </header>
      <div className="workspace">
        <aside className="mode-notice" role="status"><strong>{demo ? "演示模式 · 所有指标均为示例，不连接真实设备，不保存真实配置" : "实时监控 · 数据来自运行 Hub 的电脑"}</strong><a href={demo ? "/" : "/?mode=demo"}>{demo ? "返回真实监控" : "体验只读演示"} ↗</a></aside>
        <AppearanceBar preferences={preferences} setPreferences={setPreferences} reduced={reduced} storageNotice={storageNotice} />
        {apiError ? <p className="service-notice" role="status">{apiError}</p> : null}
      <div className="view-stage" key={view}>
        {view === "overview" ? <DataOverview snapshot={snapshot} connection={connection}
          connectedDevices={connectedDevices} examTarget={examTarget} onExamTargetSaved={setExamTarget}
          config={draftState.base} remoteReady={remoteReady} snapshotLabel={snapshotLabel} onEdit={() => setView("editor")} onConnections={() => setView("connections")}
          edition={edition} shell={preferences.shell} reduced={reduced} paused={preferences.paused} /> : null}
        {view === "editor" ? <ScreenEditor
          snapshot={snapshot}
          connection={connection}
          connectedDevices={connectedDevices}
          draftState={draftState}
          setDraftState={setDraftState}
          edition={edition}
          devices={devices}
          remoteReady={remoteReady}
          onServerState={(response) => {
            setConnectedDevices(response.connectedDevices);
            setDraftState((current) => receiveRemote(current, response.config));
          }}
        /> : null}
        {view === "connections" ? <ConnectionsView
          snapshot={snapshot}
          connection={connection}
          connectedDevices={connectedDevices}
          devices={devices}
          legacyConnections={legacyConnections}
          providers={providers}
        /> : null}
      </div>
      </div>
      <footer className="page-footer"><span>DM-01 / LOCAL SYSTEM</span><a href="/motion-review/index.html" className="text-action">原创素材与导入说明 ↗</a><span>{snapshotLabel}</span><span>{demo ? "演示配置 · 未连接真实 Hub" : remoteReady ? `Hub 配置 r${draftState.base.revision}` : "正在读取配置"} · {connection === "online" ? `${connectedDevices} 台设备连接` : "设备连接待确认"}</span></footer>
  </main>;
}
