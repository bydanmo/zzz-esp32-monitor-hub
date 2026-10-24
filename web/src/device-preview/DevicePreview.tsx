import type { CSSProperties } from "react";
import { uiLayouts } from "../design/ui-contracts.generated";
import { contrastRatio, dataStateLabel, numericMetric, type HubConnectionState } from "../state/ui-state";
import type { DeviceDisplayConfig, Snapshot } from "../types";

import { PosterCountdown as CountdownCard, PosterMetric as MetricPreview } from "./ScreenArtwork";

import { isDemoMode } from "../services/demo";

type Rect = { x: number; y: number; width: number; height: number };

function systemRects(cpu: boolean, memory: boolean): { cpu?: Rect; memory?: Rect } {
  if (cpu && memory) return uiLayouts.system;
  const full = uiLayouts.content;
  return cpu ? { cpu: full } : memory ? { memory: full } : {};
}

export function DevicePreview({ config, snapshot, connection, onPageChange, embedded = false, label = "480 × 320 设备草稿预览", navigationPrefix = "草稿预览" }: {
  config: DeviceDisplayConfig;
  snapshot: Snapshot | null;
  connection: HubConnectionState;
  onPageChange: (page: DeviceDisplayConfig["page"]) => void;
  embedded?: boolean;
  label?: string;
  navigationPrefix?: string;
}) {
  const cpu = numericMetric(snapshot, "system.cpu", 0, 100);
  const memory = numericMetric(snapshot, "system.memory", 0, 100);
  const exam = numericMetric(snapshot, "study.exam", 0);
  const showCpu = config.visible.cpu && config.page !== "study";
  const showMemory = config.visible.memory && config.page !== "study";
  const showExam = config.visible.exam && config.page !== "system";
  const style = {
    "--preview-background": config.theme.background,
    "--preview-card": config.theme.card,
    "--preview-accent": config.theme.accent,
    "--preview-data-text": config.theme.dataText,
    "--ticket-ink": /^#[0-9a-f]{6}$/i.test(config.theme.dataText) && contrastRatio("#F2F6FA",config.theme.dataText) > contrastRatio("#08090A",config.theme.dataText) ? "#F2F6FA" : "#08090A"
  } as CSSProperties;

  const examLabel = exam.value === 0 ? "目标时间已到" : connection !== "online" && exam.value !== null ? "离线估算" : dataStateLabel(exam.state);
  let content;
  if (config.page === "overview" && showExam && (showCpu || showMemory)) {
    content = <>
      <CountdownCard rect={uiLayouts.overview.countdown} seconds={exam.value} stateLabel={examLabel} />
      {showCpu && showMemory ? <>
        <MetricPreview rect={uiLayouts.overview.cpu} title="CPU" value={cpu.value} state={cpu.state} />
        <MetricPreview rect={uiLayouts.overview.memory} title="内存" value={memory.value} state={memory.state} />
      </> : <MetricPreview
        rect={uiLayouts.overview.singleMetric}
        title={showCpu ? "CPU" : "内存"}
        value={showCpu ? cpu.value : memory.value}
        state={showCpu ? cpu.state : memory.state}
      />}
    </>;
  } else if (showExam) {
    content = <CountdownCard rect={uiLayouts.study.countdown} seconds={exam.value} stateLabel={examLabel} />;
  } else if (showCpu || showMemory) {
    const rects = systemRects(showCpu, showMemory);
    content = <>
      {rects.cpu ? <MetricPreview rect={rects.cpu} title="CPU" value={cpu.value} state={cpu.state} /> : null}
      {rects.memory ? <MetricPreview rect={rects.memory} title="内存" value={memory.value} state={memory.state} /> : null}
    </>;
  } else {
    content = <g><rect {...uiLayouts.content} rx="12" className="preview-card" />
      <text x="240" y="155" textAnchor="middle" className="preview-small">没有可显示的指标</text></g>;
  }

  const pages = ["overview", "system", "study"] as const;
  return <div className="preview-shell" style={style}>
    <svg viewBox="0 0 480 320" role="group" aria-label={label}>
      <rect width="480" height="320" rx="16" className="preview-background" />
      <g role="img" aria-label={{
        connecting: "Hub 连接中",
        online: isDemoMode() ? "演示通路" : "Hub 在线",
        reconnecting: "Hub 重连",
        offline: "Hub 离线"
      }[connection]}>
        <circle cx="464" cy="6" r="6" fill={connection === "online" ? "#4CE68A" : connection === "offline" ? "#F17866" : "#FFBA53"} opacity=".14" />
        <circle cx="464" cy="6" r="3" fill={connection === "online" ? "#4CE68A" : connection === "offline" ? "#F17866" : "#FFBA53"} />
      </g>
      <svg {...uiLayouts.content} overflow="hidden" aria-hidden="true">
        <text x={config.page === "study" ? 284 : 110} y="46" className="preview-scene-word">{{overview:"MONITOR",system:"SYSTEM",study:"STUDY"}[config.page]}</text>
        {Array.from({length:23},(_,i) => <rect key={i} x={i*20} y={uiLayouts.content.height-9} width="8" height="5" rx="1" fill="#a8b6c8" opacity=".3" />)}
      </svg>
      {content}
      <rect {...uiLayouts.navigation} rx="24" className="meter-body" />
      <circle cx="25" cy="273" r="2" className="preview-screw" /><circle cx="455" cy="303" r="2" className="preview-screw" />
      {pages.map((page, index) => {
        const width = uiLayouts.navigation.width / 3;
        const x = uiLayouts.navigation.x + width * index;
        const enabled = page === "overview" ||
          (page === "system" && (config.visible.cpu || config.visible.memory)) ||
          (page === "study" && config.visible.exam);
        return <g key={page} role="button" tabIndex={enabled ? 0 : -1} aria-label={`${navigationPrefix}${{ overview: "总览", system: "系统", study: "学习" }[page]}`} aria-disabled={!enabled} aria-pressed={config.page === page} className={enabled ? "preview-nav" : "preview-nav disabled"} onClick={() => enabled && onPageChange(page)} onKeyDown={event => {
          if (enabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onPageChange(page); }
        }}>
          {config.page === page ? <rect x={x + 4} y="268" width={width - 8} height="38" rx="20" className="preview-nav-pressed" /> : null}
          <text x={x + width / 2} y="294" textAnchor="middle" fontSize="16" className={config.page === page ? "preview-nav-active" : "preview-small"}>
            {{ overview: "总览", system: "系统", study: "学习" }[page]}
          </text>
        </g>;
      })}
    </svg>
    {!embedded ? <p>预览草稿 · 480 × 320 逻辑尺寸</p> : null}
  </div>;
}
