import { findMetric, type HubConnectionState } from "../../state/ui-state";
import type { DeviceSessionView, ProviderState, Snapshot } from "../../types";

import { isDemoMode } from "../../services/demo";

const providerLabel: Record<ProviderState["status"], string> = {
  waiting: "等待首次采集",
  ready: "正常",
  degraded: "降级（使用缓存）",
  failed: "采集失败",
  disabled: "未启用"
};

export function ConnectionsView({ snapshot, connection, connectedDevices, devices, legacyConnections, providers }: {
  snapshot: Snapshot | null;
  connection: HubConnectionState;
  connectedDevices: number;
  devices: DeviceSessionView[];
  legacyConnections: number;
  providers: ProviderState[];
}) {
  const host = findMetric(snapshot, "system.host");
  return <div className="page-stack">
    <div className="section-heading"><div><p className="eyebrow">CONNECTIONS / 03</p><h1>每条连接，都有来处<span className="headline-dot">。</span></h1></div></div>
    <div className="signal-route" aria-label="当前信号通路">
      <div><span className="route-port" aria-hidden="true">W</span><small>WEB CONSOLE</small><b>网页控制台</b></div>
      <span className={connection === "online" ? "route-wire connected" : "route-wire"}><i /><em>{connection === "online" ? (isDemoMode() ? "示例通路" : "实时连接") : "等待连接"}</em></span>
      <div><span className="route-port hub-port" aria-hidden="true">H</span><small>LOCAL HUB</small><b>{isDemoMode() ? "示例 Hub（未连接）" : "本地 Hub"}</b></div>
      <span className={connection === "online" && connectedDevices > 0 ? "route-wire connected" : "route-wire"}><i /><em>{connection === "online" ? `${connectedDevices} 台设备` : "待确认"}</em></span>
      <div><span className="route-port" aria-hidden="true">D</span><small>DESK UNIT</small><b>桌面终端</b></div>
      <span className="route-print" aria-hidden="true">SIGNAL PATH / 03</span>
    </div>
    <section className="connection-list">
      <article><div><strong>{isDemoMode() ? "演示模式" : "本地 Hub"}</strong><p>{isDemoMode() ? "未打开真实 API 或 WebSocket 通道" : "Web 控制台到 Hub 的实时通道"}</p></div><span className={"connection-value " + connection}>{{ connecting: "正在连接", online: isDemoMode() ? "本地只读示例" : "实时连接", reconnecting: "正在重连", offline: "已断开" }[connection]}</span></article>
      <article><div><strong>显示设备</strong><p>{connection === "online" ? "当前建立设备通道的连接数量" : "保留上次结果，实时状态待确认"}</p></div><span className="connection-value">{connection === "online" ? `${connectedDevices} 台` : "待确认"}</span></article>
      <article><div><strong>主机遥测</strong><p>CPU、内存与运行状态的数据来源</p></div><span className="connection-value">{String(host?.value ?? "等待数据")}</span></article>
    </section>
    <section>
      <div className="section-heading"><div><p className="eyebrow">DEVICES</p><h2>设备与配置确认</h2></div></div>
      <div className="connection-list">
        {devices.map((device) => <article key={device.id}>
          <div><strong>{device.id}</strong><p>{device.model} · 固件 {device.firmwareVersion} · {device.capabilities.join(" / ")}</p></div>
          <span className={"connection-value " + (device.configState === "rejected" ? "warning" : "online")}>
            {device.configState === "applied" ? `已应用 r${device.appliedRevision}` :
              device.configState === "pushed" ? `等待确认 r${device.pushedRevision}` :
                device.configState === "rejected" ? `拒绝：${device.rejectionReason ?? "原因未知"}` : "已连接"}
          </span>
        </article>)}
        {legacyConnections > 0 ? <article><div><strong>旧版设备连接</strong><p>设备尚未上报身份，建议更新固件</p></div><span className="connection-value warning">{legacyConnections} 台</span></article> : null}
        {devices.length === 0 && legacyConnections === 0 ? <article><div><strong>暂无设备</strong><p>等待 ESP32 建立连接并发送 hello</p></div><span className="connection-value">离线</span></article> : null}
      </div>
    </section>
    <section>
      <div className="section-heading"><div><p className="eyebrow">PROVIDERS</p><h2>数据源状态</h2></div></div>
      <div className="connection-list">
        {providers.map((provider) => <article key={provider.id}>
          <div><strong>{provider.label}</strong><p>{provider.id} · {provider.metricCount} 项指标{provider.errorCode ? ` · ${provider.errorCode}` : ""}</p></div>
          <span className={"connection-value " + (provider.status === "ready" ? "online" : "warning")}>{providerLabel[provider.status]}</span>
        </article>)}
      </div>
    </section>
  </div>;
}
