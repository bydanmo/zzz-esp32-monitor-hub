import { useState, type ReactNode } from "react";
import type { DevicePage } from "../types";

export function TerminalDevice({ children, page, onNext, onHome, caption }: {
  children: ReactNode;
  page: DevicePage;
  onNext: () => void;
  onHome: () => void;
  caption: string;
}) {
  const [brightness, setBrightness] = useState(100);
  return <section className="device-stage terminal-root" data-preview-page={page} aria-label="DM-01 桌面终端">
    <div className="stage-number" aria-hidden="true">01</div><div className="stage-rail"><span>DESK UNIT / DM-01</span><span>480 × 320</span></div>
    <div className="terminal-wrap"><div className="terminal">
      <div className="case-top">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}<span>DM-01</span></div>
      <div className="terminal-face"><div className="screen-bezel"><div className="screen-recess"><div className="active-screen" style={{ filter: `brightness(${brightness / 100})` }}>{children}</div><div className="glass-reflection" aria-hidden="true" /></div></div>
        <div className="control-bank"><span className="screw top-screw" aria-hidden="true" /><div className="device-model">DM-01<small>DESK MONITOR</small></div><div className="speaker-grille" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div><button type="button" className="dial main-dial" aria-label="预览下一页" onClick={onNext}><span /></button><span className="dial-caption">PREVIEW PAGE</span><label className="brightness-control"><span className="mini-dial" aria-hidden="true" /><input type="range" min="40" max="100" value={brightness} aria-label="本地预览亮度" onChange={e => setBrightness(Number(e.target.value))} /><span>预览 {brightness}</span></label><div className="status-lamp" aria-hidden="true" /><span className="screw bottom-screw" aria-hidden="true" /></div>
      </div>
      <div className="vcr-base"><div className="hardware-keys"><button type="button" onClick={onNext} aria-label="切换预览页面">↻</button><button type="button" onClick={onHome} aria-label="预览返回总览">■</button></div><div className="media-slot"><span>LOCAL DISPLAY / PREVIEW</span><i /></div><div className="base-grille" aria-hidden="true" /></div><div className="feet" aria-hidden="true"><i /><i /></div>
    </div></div>
    <div className="stage-bottom"><span className="serial-label"><b>3:2</b>{caption}</span><span className="local-preview-note">旋钮与亮度仅控制预览</span></div>
  </section>;
}
