import assert from "node:assert/strict";
import test from "node:test";
import { ConfigWriteQueue } from "../hub/src/config-write-queue";

test("revision checks stay inside serialized writes and failed writes do not block later work", async () => {
  const queue = new ConfigWriteQueue();
  let revision = 20;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = queue.run(async () => { await gate; revision += 1; return revision; });
  const second = queue.run(async () => { if (revision !== 20) throw new Error("conflict"); revision += 1; });
  const rejected = assert.rejects(second, /conflict/);
  const third = queue.run(async () => revision);
  release();
  assert.equal(await first, 21);
  await rejected;
  assert.equal(await third, 21);
});
