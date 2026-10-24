import type { Dispatch, SetStateAction } from "react";
import type { ThemeEdition } from "../../design/appearance";
import { configurationDelivery } from "../../state/configuration-delivery";
import { fetchDeviceConfig, saveDeviceConfig } from "../../services/hub-api";
import { defaultDeviceConfig } from "../../state/default-config";
import {
  isDraftDirty,
  acceptSavedDraft,
  discardDraft,
  keepLocal,
  loadRemote,
  type DraftState
} from "../../state/draft-store";
import { validateDraft, type HubConnectionState } from "../../state/ui-state";
import { maxDisplayTitleCharacters, sanitizeDisplayTitle } from "../../state/title-validation";
import type { DeviceConfigResponse, DeviceDisplayConfig, DeviceSessionView, Snapshot } from "../../types";
import { SceneManager } from "./SceneManager";
import { ComposerPreview } from "./ComposerPreview";
import { DeviceThemePicker } from "./DeviceThemePicker";

export function ScreenEditor({ snapshot, connection, connectedDevices, draftState, setDraftState, onServerState, edition, devices, remoteReady }: {
  snapshot: Snapshot | null;
  connection: HubConnectionState;
  connectedDevices: number;
  draftState: DraftState;
  setDraftState: Dispatch<SetStateAction<DraftState>>;
  onServerState: (response: DeviceConfigResponse) => void;
  edition: ThemeEdition;
  devices: DeviceSessionView[];
  remoteReady: boolean;
}) {
  const saving = Boolean(draftState.pendingSave);
  const changed = isDraftDirty(draftState);
  const error = validateDraft(draftState.draft);

  const updateDraft = (updater: (draft: DeviceDisplayConfig) => DeviceDisplayConfig) => {
    setDraftState((current) => ({
      ...current,
      draft: updater(current.draft),
      status: "有未应用更改"
    }));
  };

  const updateTheme = (key: keyof DeviceDisplayConfig["theme"], value: string) =>
    updateDraft((draft) => ({ ...draft, theme: { ...draft.theme, [key]: value.toUpperCase() } }));

  const updateActiveScene = (updater: (scene: DeviceDisplayConfig["scenes"][number]) => DeviceDisplayConfig["scenes"][number]) =>
    updateDraft((draft) => {
      const scenes = draft.scenes.map((scene) => scene.id === draft.activeSceneId ? updater(scene) : scene);
      const active = scenes.find((scene) => scene.id === draft.activeSceneId) ?? scenes[0];
      return { ...draft, scenes, page: active.page, visible: structuredClone(active.visible) };
    });

  const updateVisible = (key: keyof DeviceDisplayConfig["visible"], value: boolean) =>
    updateActiveScene((scene) => ({ ...scene, visible: { ...scene.visible, [key]: value } }));

  const save = async () => {
    if (!changed || error || saving || draftState.conflict || !remoteReady || connection !== "online") return;
    const submitted = structuredClone(draftState.draft);
    const submittedRevision = draftState.base.revision;
    setDraftState((current) => ({ ...current, pendingSave: true, status: "正在保存到 Hub…" }));
    try {
      const latest = await fetchDeviceConfig();
      onServerState(latest);
      if (latest.config.revision !== submittedRevision) {
        setDraftState((current) => ({
          ...current,
          conflict: latest.config,
          status: "远端配置已更新，请先处理冲突"
        }));
        return;
      }
      const response = await saveDeviceConfig({
        ...submitted,
        revision: submittedRevision
      });
      const status = response.pushedDevices > 0
        ? "Hub 已保存，并已向 " + response.pushedDevices + " 台设备推送"
        : "Hub 已保存，等待设备上线";
      setDraftState(current => acceptSavedDraft(current, submitted, response.config, status));
      onServerState(response);
    } catch (cause) {
      setDraftState((current) => ({
        ...current,
        status: cause instanceof Error ? cause.message : "保存失败，草稿已保留"
      }));
    } finally {
      setDraftState(current => ({ ...current, pendingSave: false }));
    }
  };

  const draft = draftState.draft;
  const delivery = configurationDelivery(devices, draftState.base.revision, connectedDevices, connection === "online");
  return <><div className="section-heading"><div><p className="eyebrow">DEVICE COMPOSER / 02</p><h1>把屏幕，调成你的<span className="headline-dot">。</span></h1></div></div><section className="editor-layout">
    <div className="preview-column">
      <ComposerPreview key={`${draft.activeSceneId}:${draft.page}`} config={draft} snapshot={snapshot} connection={connection} />
      <div className={`delivery-status ${delivery.state}`} role="status">{delivery.label}</div>
    </div>
    <div className="control-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">DEVICE COMPOSER</p><h2>屏幕编辑</h2></div>
        <span className={changed ? "draft-state changed" : "draft-state"}>{changed ? "有未应用更改" : draftState.status}</span>
      </div>

      {draftState.conflict ? <div className="conflict-box" role="alert">
        <strong>Hub 上的配置已更新</strong>
        <p>远端 revision 为 {draftState.conflict.revision}，本地草稿基于 revision {draftState.base.revision}。</p>
        <div><button type="button" disabled={saving} onClick={() => setDraftState(loadRemote)}>载入远端配置</button>
          <button type="button" disabled={saving} onClick={() => setDraftState(keepLocal)}>保留本地草稿</button></div>
      </div> : null}

      <label className="field">
        <span>终端名称 <small>{Array.from(draft.title).length}/{maxDisplayTitleCharacters}</small></span>
        <input value={draft.title} maxLength={maxDisplayTitleCharacters}
          onChange={(event) => updateDraft((current) => ({
            ...current,
            title: sanitizeDisplayTitle(event.target.value)
          }))}
          placeholder="ESP32 监控屏"
        />
        <small className="field-help">用于控制台识别，不占用设备屏幕。</small>
      </label>

      <fieldset><legend>场景模板 · {draft.scenes.find(scene => scene.id === draft.activeSceneId)?.name}</legend><div className="segmented">
        {(["overview", "system", "study"] as const).map((page) =>
          <button type="button" key={page} className={draft.page === page ? "active" : ""}
            onClick={() => updateActiveScene((scene) => ({ ...scene, page }))}>
            {page === "overview" ? "总览" : page === "system" ? "系统" : "学习"}
          </button>)}
      </div></fieldset>

      <SceneManager config={draft} onChange={(config) => updateDraft(() => config)} />

      <fieldset><legend>设备配色</legend>
        <DeviceThemePicker theme={draft.theme} onChange={theme => updateDraft(current => ({ ...current, theme }))} />
        <button type="button" className="secondary load-edition" onClick={() => updateDraft(current => ({ ...current, theme: { ...edition.deviceTheme } }))}>载入“{edition.label}”配色</button>
        <p className="field-help">六套配色均可直接预览，点击应用配置后才会发送。上方的本机外观单独保存。</p>
        <details className="custom-colors"><summary>自定义四种颜色</summary><div className="color-fields">
          {(["background", "card", "accent", "dataText"] as const).map((key) =>
            <label key={key}>{key === "background" ? "背景" : key === "card" ? "卡片" : key === "accent" ? "强调" : "数据文字"}
              <input type="color" value={draft.theme[key]} onChange={(event) => updateTheme(key, event.target.value)} />
            </label>)}
        </div></details>
      </fieldset>

      <fieldset><legend>显示指标</legend><div className="toggle-list">
        {([
          ["cpu", "CPU 占用率", "主机实时处理器负载"],
          ["memory", "内存占用率", "当前已使用内存比例"],
          ["exam", "考试倒计时", "距离考试剩余时间"]
        ] as const).map(([key, label, description]) =>
          <label className="toggle-row" key={key}><span><b>{label}</b><small>{description}</small></span>
            <input type="checkbox" checked={draft.visible[key]}
              onChange={(event) => updateVisible(key, event.target.checked)} /></label>)}
      </div></fieldset>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="editor-actions">
        <div><span className={connectedDevices > 0 ? "device-dot online" : "device-dot"} />
          {connectedDevices > 0 ? connectedDevices + " 台设备已连接" : "没有设备连接，仍可保存到 Hub"}
          <small aria-live="polite">{draftState.status}</small>
        </div>
        <div className="editor-reset-actions"><button type="button" className="secondary" disabled={!changed || saving}
          onClick={() => setDraftState(discardDraft)}>放弃草稿</button>
        <button type="button" className="secondary" disabled={saving} onClick={() => updateDraft((current) => ({
          ...structuredClone(defaultDeviceConfig),
          revision: current.revision
        }))}>恢复默认</button></div>
        <button type="button" className="primary" aria-busy={saving} disabled={!changed || Boolean(error) || saving || Boolean(draftState.conflict) || !remoteReady || connection !== "online"}
          title={!remoteReady ? "等待载入 Hub 配置" : connection !== "online" ? "Hub 连接恢复后可应用" : draftState.conflict ? "请先处理远端配置冲突" : !changed ? "没有未应用更改" : error ?? undefined} onClick={save}>
          {saving ? "正在保存…" : "应用配置"}
        </button>
      </div>
    </div>
  </section></>;
}
