import type { HubConnectionState } from "../state/ui-state";

export function StatusBadge({ state }: { state: HubConnectionState }) {
  const label = {
    connecting: "正在连接 Hub",
    online: "Hub 实时连接",
    reconnecting: "正在重新连接",
    offline: "Hub 已断开"
  }[state];
  return <span className={"status-badge " + state}><i />{label}</span>;
}
