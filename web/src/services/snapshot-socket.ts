import type { Snapshot } from "../types";
import type { HubConnectionState } from "../state/ui-state";

import { demoSnapshot, isDemoMode } from "./demo";

const retrySeconds = [1, 2, 4, 8, 15] as const;

export function connectSnapshotSocket(
  onSnapshot: (snapshot: Snapshot) => void,
  onState: (state: HubConnectionState) => void,
  onReconnect: () => void
): () => void {
  if (isDemoMode()) {
    onState("online");
    onSnapshot(demoSnapshot());
    const timer = window.setInterval(() => onSnapshot(demoSnapshot()), 1000);
    return () => { window.clearInterval(timer); onState("offline"); };
  }
  let socket: WebSocket | null = null;
  let timer: number | null = null;
  let stopped = false;
  let attempt = 0;
  let hasOpened = false;

  const connect = () => {
    if (stopped) return;
    onState(attempt === 0 ? "connecting" : "reconnecting");
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(scheme + "://" + location.host + "/ws");
    socket.onopen = () => {
      const reconnected = hasOpened;
      hasOpened = true;
      attempt = 0;
      onState("online");
      if (reconnected) onReconnect();
    };
    socket.onmessage = ({ data }) => {
      try {
        const message = JSON.parse(String(data)) as { type?: string; payload?: Snapshot };
        if (message.type === "snapshot" && message.payload) onSnapshot(message.payload);
      } catch {
        // An invalid frame must not tear down the last valid snapshot.
      }
    };
    socket.onclose = () => {
      if (stopped) return;
      onState("reconnecting");
      const base = retrySeconds[Math.min(attempt, retrySeconds.length - 1)] * 1000;
      const jitter = Math.round(base * (Math.random() * 0.2 - 0.1));
      attempt += 1;
      timer = window.setTimeout(connect, base + jitter);
    };
    socket.onerror = () => socket?.close();
  };

  connect();
  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    socket?.close();
    onState("offline");
  };
}
