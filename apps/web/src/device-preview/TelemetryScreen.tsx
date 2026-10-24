import type { DevicePage, Snapshot } from "../types";
import type { HubConnectionState } from "../state/ui-state";
import { defaultDeviceConfig } from "../state/default-config";
import { DevicePreview } from "./DevicePreview";

export const previewPages = ["overview", "system", "study"] as const;
export const previewPageNames = { overview: "总览", system: "系统", study: "学习" };

export function TelemetryScreen({ page, snapshot, connection, onPageChange }: {
  page: DevicePage; snapshot: Snapshot | null; connection: HubConnectionState; onPageChange: (page: DevicePage) => void;
}) {
  // This local data view follows web appearance. Device changes use explicit apply.
  return <DevicePreview embedded label="实时数据视图，480 乘 320；不是实机截图" navigationPrefix="预览"
    config={{ ...defaultDeviceConfig, page, theme: {
      background: "var(--screen-bg)", card: "var(--screen-card)",
      accent: "var(--signal)", dataText: "var(--signal)"
    } }} snapshot={snapshot} connection={connection} onPageChange={onPageChange} />;
}
