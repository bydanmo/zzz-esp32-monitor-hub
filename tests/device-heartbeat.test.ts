import assert from "node:assert/strict";
import test from "node:test";
import { DeviceHeartbeat, type HeartbeatSocket } from "../apps/hub/src/device-heartbeat.js";

function socket() {
  const calls = { pings: 0, terminations: 0 };
  const client: HeartbeatSocket = {
    readyState: 1,
    ping() { calls.pings += 1; },
    terminate() { calls.terminations += 1; }
  };
  return { client, calls };
}

test("心跳应答允许下一轮探测，超时连接会被终止", () => {
  const { client, calls } = socket();
  let responses = 0;
  const heartbeat = new DeviceHeartbeat(() => { responses += 1; });
  heartbeat.tick([client]);
  assert.equal(calls.pings, 1);
  heartbeat.pong(client);
  assert.equal(responses, 1);
  heartbeat.tick([client]);
  assert.equal(calls.pings, 2);
  heartbeat.tick([client]);
  assert.equal(calls.terminations, 1);
  heartbeat.remove(client);
  heartbeat.pong(client);
  assert.equal(responses, 1);
});

test("心跳发送失败时立即终止连接", () => {
  const { client, calls } = socket();
  client.ping = () => { throw new Error("disconnected"); };
  const heartbeat = new DeviceHeartbeat(() => {});
  heartbeat.tick([client]);
  assert.equal(calls.terminations, 1);
});
