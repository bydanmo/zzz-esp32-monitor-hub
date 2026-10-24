import { useState } from "react";
import { MetricCard } from "../../components/MetricCard";
import { ModuleRack, SignalStation } from "../../components/SignalStation";
import { TerminalShowcase } from "../../three/TerminalShowcase";
import type { ThemeEdition, AppearancePreferences } from "../../design/appearance";
import { dataStateLabel, findMetric, numericMetric, type DataState, type HubConnectionState } from "../../state/ui-state";
import type { DeviceDisplayConfig, ExamTargetResponse, Snapshot } from "../../types";
import { ExamTargetEditor } from "./ExamTargetEditor";

import { isDemoMode } from "../../services/demo";

function rate(value: number | null): string {
  if (value === null) return "--";
  if (value >= 1024 ** 2) return (value / 1024 ** 2).toFixed(1);
  if (value >= 1024) return (value / 1024).toFixed(1);
  return String(Math.round(value));
}

function rateUnit(value: number | null): string {
  if (value !== null && value >= 1024 ** 2) return "MB/s";
  if (value !== null && value >= 1024) return "KB/s";
  return "B/s";
}

type MetricGroup = "all" | "load" | "thermal" | "network";
type SystemCard = {
  code: string; group: Exclude<MetricGroup, "all">; title: string;
  value: string; unit: string; state: DataState; progress?: number | null;
};

export function DataOverview({ snapshot, connection, connectedDevices, examTarget, onExamTargetSaved, config, remoteReady, snapshotLabel, onEdit, onConnections, edition, shell, reduced, paused }: {
  snapshot: Snapshot | null;
  connection: HubConnectionState;
  connectedDevices: number;
  examTarget: ExamTargetResponse | null;
  onExamTargetSaved: (response: ExamTargetResponse) => void;
  config: DeviceDisplayConfig;
  remoteReady: boolean;
  snapshotLabel: string;
  onEdit: () => void;
  onConnections: () => void;
  edition:ThemeEdition;
  shell:AppearancePreferences["shell"];
  reduced:boolean;
  paused:boolean;
}) {
  const [metricGroup, setMetricGroup] = useState<MetricGroup>("all");
  const cpu = numericMetric(snapshot, "system.cpu", 0, 100);
  const memory = numericMetric(snapshot, "system.memory", 0, 100);
  const exam = numericMetric(snapshot, "study.exam", 0);
  const host = findMetric(snapshot, "system.host");
  const gpu = numericMetric(snapshot, "system.gpu", 0, 100);
  const cpuTemperature = numericMetric(snapshot, "system.cpu.temperature", 0, 150);
  const gpuTemperature = numericMetric(snapshot, "system.gpu.temperature", 0, 150);
  const disk = numericMetric(snapshot, "system.disk", 0, 100);
  const download = numericMetric(snapshot, "system.network.download", 0);
  const upload = numericMetric(snapshot, "system.network.upload", 0);
  const days = exam.value === null ? "--" : String(Math.floor(exam.value / 86400));
  const cards: SystemCard[] = [
    { code: "CPU", group: "load", title: "CPU 占用率", value: cpu.value === null ? "--" : String(Math.round(cpu.value)), unit: "%", state: cpu.state, progress: cpu.value },
    { code: "RAM", group: "load", title: "内存占用率", value: memory.value === null ? "--" : String(Math.round(memory.value)), unit: "%", state: memory.state, progress: memory.value },
    { code: "GPU", group: "load", title: "GPU 占用率", value: gpu.value === null ? "--" : String(Math.round(gpu.value)), unit: "%", state: gpu.state, progress: gpu.value },
    { code: "DISK", group: "load", title: "磁盘占用率", value: disk.value === null ? "--" : String(Math.round(disk.value)), unit: "%", state: disk.state, progress: disk.value },
    { code: "CPU °C", group: "thermal", title: "CPU 温度", value: cpuTemperature.value === null ? "--" : cpuTemperature.value.toFixed(1), unit: "°C", state: cpuTemperature.state },
    { code: "GPU °C", group: "thermal", title: "GPU 温度", value: gpuTemperature.value === null ? "--" : gpuTemperature.value.toFixed(1), unit: "°C", state: gpuTemperature.state },
    { code: "RX", group: "network", title: "下载速率", value: rate(download.value), unit: rateUnit(download.value), state: download.state },
    { code: "TX", group: "network", title: "上传速率", value: rate(upload.value), unit: rateUnit(upload.value), state: upload.state }
  ];
  const visibleCards = cards.filter(card => metricGroup === "all" || card.group === metricGroup);

  return <div className="page-stack">
    <div className="section-heading hero-heading"><div><p className="eyebrow">DEVICE CONSOLE / 01</p><h1>小屏幕，大日常<span className="headline-dot">。</span></h1></div><div className="unit-tag"><span>桌面终端</span><b>DM—01</b><small>480 × 320 / ESP32-S3</small></div></div>
    <div className="console-layout">
      <TerminalShowcase snapshot={snapshot} connection={connection} edition={edition} shell={shell} reduced={reduced} paused={paused} />
      <section className="data-panel" aria-label="实时数据总览">
        <span className="panel-screw screw-left" aria-hidden="true" /><span className="panel-screw screw-right" aria-hidden="true" />
        <div className="panel-heading"><div><p className="eyebrow">LIVE AT YOUR DESK</p><h2>数据总览</h2></div><span className={`connection-pill ${connection === "online" ? "" : "is-offline"}`}><i /><span>{connection === "online" ? (isDemoMode() ? "演示通路" : "Hub 在线") : "等待重连"}</span></span></div>
        <div className="identity-plate"><div className="plate-symbol" aria-hidden="true">D<span>01</span></div><div><span className="tiny-label">{remoteReady ? "当前 Hub 保存配置" : "本地配置基线 · 待 Hub 确认"}</span><h3>{config.title}</h3><span className="device-spec">ESP32-S3 · 480 × 320 · {remoteReady ? `r${config.revision}` : "版本待确认"}</span></div><span className="profile-mark" aria-hidden="true">01</span></div>
        <div className="countdown-module"><div className="module-label"><span>考研倒计时</span><span className="tiny-label">COUNTDOWN</span></div><div className={`countdown-readout ${days.length > 4 ? "long-readout" : ""}`}><strong>{days}</strong><span>天<small>KEEP GOING</small></span></div><div className="countdown-baseline"><span>{dataStateLabel(exam.state)}</span><span>{examTarget?.target.examAt ? "目标已设置" : "等待考试目标"}</span></div></div>
        <div className="hero-metrics">{[{ name: "CPU 负载", mark: "C", data: cpu }, { name: "内存占用", mark: "M", data: memory }].map(({ name, mark, data }) => <div key={mark}><div className="metric-row"><span><i className="metric-icon">{mark}</i>{name}</span><strong>{data.value === null ? "--" : Math.round(data.value)}<small>%</small></strong></div><div className="metric-track"><i style={{ width: `${data.value ?? 0}%` }} /></div><p className={`reading-state state-${data.state}`}>{dataStateLabel(data.state)}</p></div>)}</div>
        <p className="freshness-row"><span className={connection === "online" ? "status-dot" : "status-dot interrupted"} /><span>{snapshotLabel}</span></p>
        <div className="panel-actions"><span className="device-count">{connection === "online" ? `${connectedDevices} 台设备连接` : "设备连接待确认"}</span><button type="button" className="action-button primary" onClick={onEdit}><span className="action-icon">↗</span><span>编辑设备屏幕</span><span className="action-arrow">↗</span></button></div>
      </section>
    </div>
    <section className="summary-grid" aria-label="连接摘要">
      <article><span>{isDemoMode() ? "示例通路" : "Hub 状态"}</span><strong>{connection === "online" ? (isDemoMode() ? "演示数据" : "实时连接") : connection === "connecting" ? "正在连接" : "连接中断"}</strong></article>
      <article><span>{connection === "online" ? "设备连接" : "上次设备连接"}</span><strong>{snapshot ? `${connectedDevices} 台` : "待确认"}</strong></article>
      <article><span>监控主机</span><strong>{String(host?.value ?? "--")}</strong></article>
    </section>
    <ModuleRack onEdit={onEdit} onConnections={onConnections} />
    <section className="system-console" aria-label="主机仪表">
      <header className="instrument-heading"><span className="section-index" aria-hidden="true">02</span><div><p className="eyebrow">HOST TELEMETRY</p><h2>系统状态</h2></div><span className="instrument-count">{String(visibleCards.length).padStart(2, "0")} / 指标</span></header>
      <div className="metric-filter-bar"><div className="metric-filters" role="group" aria-label="指标分类">
        {([["all", "全部"], ["load", "负载"], ["thermal", "温度"], ["network", "网络"]] as const).map(([group, label]) => <button type="button" key={group} aria-pressed={metricGroup === group} onClick={() => setMetricGroup(group)}>{label}</button>)}
      </div><span>{isDemoMode() ? "演示指标 · 非真实数据" : "实时主机数据"}</span></div>
      <div className="metric-grid instrument-grid" data-count={visibleCards.length}>
        {visibleCards.map(({ group: _group, ...card }) => <MetricCard key={card.code} {...card} />)}
      </div>
      <div className="instrument-foot"><span>HOST / {String(host?.value ?? "等待数据")}</span><span>{snapshotLabel}</span></div>
    </section>
    <section className="study-dossier">
      <header className="instrument-heading"><span className="section-index" aria-hidden="true">03</span><div><p className="eyebrow">PERSONAL TARGET</p><h2>考试倒计时</h2></div><span className="dossier-stamp">学习计划</span></header>
      <div className="study-grid">
        <MetricCard title="剩余时间" value={days} unit="天" state={exam.state} code="T-DAY" />
        <ExamTargetEditor response={examTarget} onSaved={onExamTargetSaved} />
      </div>
    </section>
    <SignalStation edition={edition} />
  </div>;
}
