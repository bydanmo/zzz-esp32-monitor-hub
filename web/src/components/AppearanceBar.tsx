import { useId, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { getEdition, themeEditions, type AppearancePreferences } from "../design/appearance";
import { channelArtwork } from "../design/reference-assets";

export function AppearanceBar({ preferences, setPreferences, reduced, storageNotice }: {
  preferences: AppearancePreferences;
  setPreferences: Dispatch<SetStateAction<AppearancePreferences>>;
  reduced: boolean;
  storageNotice: string;
}) {
  const edition = getEdition(preferences.theme);
  const [expanded, setExpanded] = useState(false);
  const settingsId = useId();
  const patch = (value: Partial<AppearancePreferences>) => setPreferences(current => ({ ...current, ...value }));
  return <section className="appearance-settings edition-dock" aria-label="本机外观设置">
    <div className="edition-dock-top">
      <div className="edition-dock-caption"><b>色彩频道</b><span>COLOR EDITION</span></div>
      <div className="theme-options" role="group" aria-label="界面主题">
        {themeEditions.map((entry, i) => <button type="button" key={entry.id}
          className={preferences.theme === entry.id ? "theme-chip is-active" : "theme-chip"}
          data-theme={entry.id} aria-pressed={preferences.theme === entry.id}
          style={{ "--swatch": entry.accent, "--swatch-bg": entry.canvas } as CSSProperties}
          onClick={() => patch({ theme: entry.id })}>
          <span className="edition-cover" aria-hidden="true" style={{ backgroundImage: `url(${channelArtwork[entry.id].src})` }}><i /></span>
          <span>{entry.label}</span><small>0{i + 1}</small>
        </button>)}
      </div>
      <button type="button" className="edition-adjust" aria-expanded={expanded} aria-controls={settingsId}
        onClick={() => setExpanded(value => !value)}><span aria-hidden="true">☷</span><b>外观调校</b><i aria-hidden="true">{expanded ? "−" : "+"}</i></button>
    </div>
    <div id={settingsId} className="edition-tuning" hidden={!expanded}>
      <div className="tuning-heading"><span>{edition.label} / {edition.description}</span><small>仅调整本机网页外观</small></div>
      <div className="review-strip">
        <div className="depth-group" role="group" aria-label="实体层级">
          <button type="button" className={preferences.depth === "a" ? "is-active" : ""} aria-pressed={preferences.depth === "a"} onClick={() => patch({ depth: "a" })}>轻量实体</button>
          <button type="button" className={preferences.depth === "b" ? "is-active" : ""} aria-pressed={preferences.depth === "b"} onClick={() => patch({ depth: "b" })}>仪器面板</button>
        </div>
        <div className="review-options">
          <div className="shell-picker" role="group" aria-label="机壳配色"><span>机壳</span>
            {(["graphite", "ivory", "mixed"] as const).map((shell, i) => <button type="button" key={shell} data-shell={shell}
              aria-label={["石墨外壳", "米灰外壳", "拼色外壳"][i]} aria-pressed={preferences.shell === shell}
              className={preferences.shell === shell ? "is-active" : ""} onClick={() => patch({ shell })}><i /></button>)}
          </div>
          <label className="motion-control"><input type="checkbox" checked={reduced} onChange={e => patch({ motion: e.target.checked ? "reduced" : "full" })} /><span className="toggle-track" /><span>简化动效</span></label>
          <button type="button" className="text-action system-motion" aria-pressed={preferences.motion === "system"} onClick={() => patch({ motion: "system" })}>跟随系统</button>
        </div>
      </div>
      <div className="tuning-bottom">
        <div className="background-level" role="group" aria-label="背景丰富程度">
          {(["standard", "rich"] as const).map((background, i) => <button type="button" key={background}
            className={preferences.background === background ? "is-active" : ""} aria-pressed={preferences.background === background}
            onClick={() => patch({ background })}>{["标准背景", "丰富背景"][i]}</button>)}
        </div>
        <button type="button" className="background-pause" title="暂停背景及模型的滚动动效，仍可手动切换观察角度"
          aria-pressed={preferences.paused} onClick={() => patch({ paused: !preferences.paused })}>
          <b>{preferences.paused ? "▶" : "Ⅱ"}</b><span>{preferences.paused ? "继续动效" : "暂停动效"}</span>
        </button>
      </div>
    </div>
    {storageNotice ? <p className="appearance-notice" role="status">{storageNotice}</p> : null}
  </section>;
}
