import assert from "node:assert/strict";
import test from "node:test";

import { DeviceSessionRegistry } from "../apps/hub/src/device-sessions.ts";

const hello = JSON.stringify({
  type: "hello",
  protocolVersion: 1,
  device: {
    id: "esp32s3-7ce8b1b0d00c",
    model: "esp32-s3-st7796s-480x320",
    firmwareVersion: "0.2.0",
    capabilities: ["touch", "tf-video", "config-ack"]
  }
});

test("设备 hello 将 legacy 连接升级为已识别会话", () => {
  const registry = new DeviceSessionRegistry(() => new Date("2026-10-21T12:00:00.000Z"));
  const socket = {};
  registry.add(socket);
  assert.equal(registry.legacyConnections(), 1);
  assert.equal(registry.handleMessage(socket, hello), true);
  assert.equal(registry.legacyConnections(), 0);
  assert.equal(registry.list()[0]?.firmwareVersion, "0.2.0");
});

test("配置 ACK 只有同一设备且 revision 不过期时更新状态", () => {
  const registry = new DeviceSessionRegistry();
  const socket = {};
  registry.add(socket);
  registry.handleMessage(socket, hello);
  registry.markPushed(8, [socket]);
  registry.handleMessage(socket, JSON.stringify({
    type: "configAck", deviceId: "esp32s3-7ce8b1b0d00c", revision: 7, status: "applied"
  }));
  assert.equal(registry.list()[0]?.configState, "pushed");
  registry.handleMessage(socket, JSON.stringify({
    type: "configAck", deviceId: "esp32s3-7ce8b1b0d00c", revision: 8, status: "applied"
  }));
  assert.equal(registry.list()[0]?.appliedRevision, 8);
  assert.equal(registry.list()[0]?.configState, "applied");
});

test("非法、超长和设备 ID 不匹配的消息被拒绝", () => {
  const registry = new DeviceSessionRegistry();
  const socket = {};
  registry.add(socket);
  assert.equal(registry.handleMessage(socket, "{"), false);
  assert.equal(registry.handleMessage(socket, "x".repeat(512)), false);
  registry.handleMessage(socket, hello);
  assert.equal(registry.handleMessage(socket, JSON.stringify({
    type: "configAck", deviceId: "another-device", revision: 1, status: "applied"
  })), false);
});
