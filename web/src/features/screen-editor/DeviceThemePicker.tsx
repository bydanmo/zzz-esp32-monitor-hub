import type { CSSProperties } from "react";
import { themeEditions } from "../../design/appearance";
import type { DeviceDisplayConfig } from "../../types";

type DeviceTheme = DeviceDisplayConfig["theme"];
const matches = (left: DeviceTheme, right: DeviceTheme) =>
  (Object.keys(left) as (keyof DeviceTheme)[]).every(key => left[key].toUpperCase() === right[key].toUpperCase());

export function DeviceThemePicker({ theme, onChange }: { theme: DeviceTheme; onChange: (theme: DeviceTheme) => void }) {
  const selected = themeEditions.find(edition => matches(theme, edition.deviceTheme));
  return <>
    <p className="palette-current">草稿配色 <strong>{selected?.label ?? "自定义配色"}</strong></p>
    <div className="device-palette-grid" role="group" aria-label="设备配色方案">
      {themeEditions.map((edition, index) => <button type="button" key={edition.id}
        className="device-palette" aria-pressed={selected?.id === edition.id}
        aria-label={`预览${edition.label}设备配色`}
        style={{ "--palette-signal": edition.deviceTheme.dataText } as CSSProperties}
        onClick={() => onChange({ ...edition.deviceTheme })}>
        <span className="palette-sample" aria-hidden="true" style={{ background: edition.deviceTheme.background }}>
          <i style={{ background: edition.deviceTheme.card }} /><b>0{index + 1}</b><em>DM / 01</em>
        </span>
        <span className="palette-name">{edition.label}<span aria-hidden="true">{selected?.id === edition.id ? "●" : "○"}</span></span>
        <small>{edition.description}</small>
      </button>)}
    </div>
  </>;
}
