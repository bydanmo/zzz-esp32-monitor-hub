import { useEffect, useRef, useState } from "react";
import type { ThemeEdition } from "../design/appearance";
import { channelArtwork } from "../design/reference-assets";

export function SignalStation({ edition }: { edition: ThemeEdition }) {
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"room" | "film">("room");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(4);
  const [error, setError] = useState("");
  const art = channelArtwork[edition.id];

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let canceled = false;
    if (playing) {
      void player.play().catch(() => {
        if (!canceled) { setPlaying(false); setError("播放暂未开始，请重试。"); }
      });
    } else player.pause();
    return () => { canceled = true; };
  }, [playing, mode]);

  useEffect(() => {
    const player = video.current;
    const pause = () => setPlaying(false);
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) pause();
    }, { threshold: 0.04 });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); player?.pause(); };
  }, []);

  function switchMode(next: "room" | "film") {
    if (next === mode) return;
    setPlaying(false); setTime(0); setError(""); setMode(next);
  }

  return <section ref={root} className="signal-station" aria-label="信号放映台">
    <header className="station-heading"><div><p className="eyebrow">LOCAL BROADCAST / 04</p><h2>给日常，调个频道<span>。</span></h2></div><span className="station-label">本地素材 · 网页预览</span></header>
    <div className="station-body">
      <div className="broadcast-deck">
        <div className="deck-top"><span className="deck-power"><i className={playing ? "on" : ""} />{playing ? "正在放映" : "待机"}</span><b>DM—01 / SIGNAL UNIT</b><span className="deck-vents" aria-hidden="true" /></div>
        <div className="broadcast-monitor"><div className="broadcast-glass">
          <video ref={video} src={mode === "room" ? "/art/original/terminal-scene.mp4" : "/art/original/signal-film.mp4"}
            poster={mode === "room" ? "/art/original/terminal-scene.svg" : undefined}
            loop muted playsInline preload="metadata" aria-label="放映台视频"
            onTimeUpdate={event => setTime(event.currentTarget.currentTime)}
            onLoadedMetadata={event => { const value = event.currentTarget.duration; if (Number.isFinite(value) && value > 0) setDuration(value); }}
            onError={() => { setPlaying(false); setError("素材暂时无法载入，请重新载入。"); }} />
          <span className="broadcast-channel">CH. 01 <i /> {mode === "room" ? "ROOM SIGNAL" : "ORANGE SIGNAL"}</span>
        </div></div>
        <div className="deck-program"><div><small>NOW SHOWING</small><h3>橙黑信号带<span>01</span></h3><p>项目原创 · 几何信号动态图形</p></div><div className="deck-format" role="group" aria-label="放映画面构图"><button type="button" aria-pressed={mode === "room"} onClick={() => switchMode("room")}>终端场景</button><button type="button" aria-pressed={mode === "film"} onClick={() => switchMode("film")}>影片画面</button></div></div>
        <div className="deck-timeline"><input type="range" aria-label="放映进度" min="0" max={duration} step="0.01" value={Math.min(time, duration)} onChange={event => { const value = Number(event.target.value); if (video.current) video.current.currentTime = value; setTime(value); }} /><span>{time.toFixed(1).padStart(4, "0")} / {duration.toFixed(1).padStart(4, "0")}</span></div>
        <div className="transport-bank"><div className="transport-keys"><button type="button" className="play-key" aria-label={playing ? "暂停放映台视频" : "播放放映台视频"} onClick={() => { setError(""); setPlaying(!playing); }}><b aria-hidden="true">{playing ? "Ⅱ" : "▶"}</b><span>{playing ? "暂停" : "播放"}</span></button><button type="button" aria-label="从头播放放映台视频" onClick={() => { if (video.current) video.current.currentTime = 0; setTime(0); setPlaying(true); }}><b aria-hidden="true">↶</b><span>重播</span></button></div><div className="deck-grille" aria-hidden="true" /><span className="deck-stamp">DESK<br/>CINEMA</span></div>
        <div className="deck-note"><span>{error || "只在本页放映；设备屏保按原有设置运行。"}</span>{error ? <button type="button" onClick={() => { setError(""); video.current?.load(); }}>重新载入</button> : <a href="/motion-review/index.html">原创素材与自备导入 ↗</a>}</div>
      </div>
      <aside className="channel-sleeve" aria-label="当前主题频道封面"><div className="sleeve-tab"><span>ON THE WALL</span><b>{art.title}</b></div><figure><img src={art.src} alt={`${art.title}：项目原创频道图形`} width="500" height="930" loading="lazy" /><figcaption><span>原创图形 / 本项目</span><span>{edition.label}</span></figcaption></figure><div className="sleeve-label"><b>好信号，<br/>留在桌面。</b><span>DAILY SIGNAL<br/>KEEP IT PLAYING</span></div></aside>
    </div>
  </section>;
}

export function ModuleRack({ onEdit, onConnections }: { onEdit: () => void; onConnections: () => void }) {
  return <nav className="module-rack" aria-label="终端快捷入口">
    <button type="button" onClick={onEdit}><span className="module-socket" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="7" y="9" width="34" height="25" rx="5" /><path d="M16 41h16M24 34v7M14 17h20M14 23h12" /></svg></span><span className="module-copy"><small>DISPLAY / 01</small><b>装配你的屏幕</b><span>主题、布局与场景轮播</span></span><span className="module-enter" aria-hidden="true">↗</span></button>
    <button type="button" onClick={onConnections}><span className="module-socket" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M17 6v10M31 6v10M12 17h24v7a12 12 0 0 1-24 0zM24 36v7" /></svg></span><span className="module-copy"><small>CONNECTION / 02</small><b>接通每一条信号</b><span>设备连接与数据源状态</span></span><span className="module-enter" aria-hidden="true">↗</span></button>
  </nav>;
}
