export interface HeartbeatSocket {
  readyState: number;
  ping(): void;
  terminate(): void;
}

/** A missed pong on the next interval means the TCP connection is stale. */
export class DeviceHeartbeat {
  private readonly awaitingPong = new Set<HeartbeatSocket>();

  constructor(private readonly onPong: (socket: HeartbeatSocket) => void) {}

  tick(sockets: Iterable<HeartbeatSocket>): void {
    for (const socket of sockets) {
      if (socket.readyState !== 1) {
        this.awaitingPong.delete(socket);
        continue;
      }
      if (this.awaitingPong.has(socket)) {
        this.terminate(socket);
        continue;
      }
      this.awaitingPong.add(socket);
      try {
        socket.ping();
      } catch {
        this.terminate(socket);
      }
    }
  }

  private terminate(socket: HeartbeatSocket): void {
    this.awaitingPong.delete(socket);
    try {
      socket.terminate();
    } catch {
      // A concurrent close can make termination fail; the next close removes it.
    }
  }

  pong(socket: HeartbeatSocket): void {
    if (!this.awaitingPong.delete(socket)) return;
    this.onPong(socket);
  }

  remove(socket: HeartbeatSocket): void {
    this.awaitingPong.delete(socket);
  }
}
