import { useState } from "react";
import { TerminalDevice } from "../../components/TerminalDevice";
import { DevicePreview } from "../../device-preview/DevicePreview";
import { availablePreviewPages, pageNames, withPreviewPage } from "../../state/preview-config";
import type { HubConnectionState } from "../../state/ui-state";
import type { DeviceDisplayConfig, Snapshot } from "../../types";

export function ComposerPreview({ config, snapshot, connection }: {
  config: DeviceDisplayConfig; snapshot: Snapshot | null; connection: HubConnectionState;
}) {
  const [page, setPage] = useState(config.page);
  const preview = withPreviewPage(config, page);
  const pages = availablePreviewPages(config.visible);
  const sceneName = config.scenes.find(scene => scene.id === config.activeSceneId)?.name ?? "当前场景";
  return <>
    <TerminalDevice page={preview.page}
      onNext={() => setPage(pages[(pages.indexOf(preview.page) + 1) % pages.length])}
      onHome={() => setPage("overview")} caption={`本机预览 · ${sceneName}`}>
      <DevicePreview config={preview} snapshot={snapshot} connection={connection}
        onPageChange={setPage} embedded navigationPrefix="本机预览" />
    </TerminalDevice>
    <div className="preview-context">
      <div role="status"><span>预览 / {pageNames[preview.page]}</span><small>场景模板 / {pageNames[config.page]}</small></div>
      {preview.page !== config.page ? <button type="button" className="secondary" onClick={() => setPage(config.page)}>返回场景模板</button> : null}
      <p>旋钮和屏内导航只切换本机预览。修改场景模板后，点击应用配置才会发送到设备。</p>
    </div>
  </>;
}
