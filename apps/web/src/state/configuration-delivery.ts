import type { DeviceSessionView } from "../types";

export function configurationDelivery(devices: DeviceSessionView[], revision: number, connected: number, online: boolean) {
  if (!online) return { state: "waiting", label: "Hub 通道未连接，设备应用状态待确认" };
  if (connected === 0) return { state: "waiting", label: `Hub 配置 r${revision} · 等待设备上线` };
  const applied = devices.filter(device => device.configState === "applied" && device.appliedRevision === revision).length;
  const rejected = devices.filter(device => device.configState === "rejected" && device.pushedRevision === revision).length;
  if (rejected) return { state: "rejected", label: `${rejected} 台设备拒绝 r${revision}，请查看连接页` };
  if (applied === connected) return { state: "applied", label: `${applied} 台设备已确认应用 r${revision}` };
  return { state: "pending", label: `r${revision} · 已确认 ${applied}/${connected} 台，其余等待应用确认` };
}
