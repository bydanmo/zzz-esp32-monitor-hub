import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import Fastify from "fastify";
import { AnimationLibrary, animationOptions, type AnimationConverter } from "../apps/hub/src/animation-library.ts";
import { registerAnimationRoutes } from "../apps/hub/src/animation-routes.ts";

async function fixture(converter?: AnimationConverter) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "monitor-animation-"));
  const publicRoot = path.join(temp, "public"), root = path.join(temp, "library");
  await mkdir(path.join(publicRoot, "motion-assets"), { recursive: true });
  await writeFile(path.join(publicRoot, "motion-assets/crt-background.rgb565"), Buffer.alloc(480 * 320 * 2, 2));
  await writeFile(path.join(publicRoot, "motion-assets/crt-window-30fps.rgb565"), Buffer.alloc(198 * 150 * 2 * 30, 3));
  const library = new AnimationLibrary(root, publicRoot, converter ?? (async (_input, output) => {
    await writeFile(path.join(output, "frames.raw"), Buffer.alloc(198 * 150 * 2 * 15, 9));
    await writeFile(path.join(output, "preview.mp4"), "preview");
    await writeFile(path.join(output, "poster.jpg"), "poster");
    return { frames: 15 };
  }));
  await library.init();
  return { library, root, publicRoot, cleanup: () => rm(temp, { recursive: true, force: true }) };
}
const options = { title: "第二段动画", label: "CLIP 02", start: 0, duration: .5 };

test("animation conversion remains out of the device manifest until a complete CRC-checked export exists", async () => {
  const f = await fixture();
  try {
    const item = await f.library.upload(Readable.from([Buffer.from("video")]), "clip.mp4", options);
    await f.library.idle();
    const manifest = f.library.manifest();
    assert.equal(manifest.entries.length, 2);
    assert.equal(manifest.entries[1].bytes, 198 * 150 * 2 * 15);
    assert.equal(manifest.entries[1].id, item.id);
    assert.ok(Number.isInteger(manifest.entries[1].crc));
    const reloaded = new AnimationLibrary(f.root, f.publicRoot, async () => { throw new Error("unused"); });
    await reloaded.init();
    assert.equal(reloaded.snapshot().items.find(i => i.id === item.id)?.state, "ready");
    assert.equal(await readFile(path.join(f.root, item.id, "upload.mp4")).then(() => true, () => false), false);
  } finally { await f.cleanup(); }
});

test("failed conversion leaves previous animation usable, never enters the manifest, and can be removed", async () => {
  const f = await fixture(async () => { throw new Error("bad video"); });
  try {
    const item = await f.library.upload(Readable.from(["invalid"]), "broken.gif", options);
    await f.library.idle();
    assert.equal(f.library.snapshot().items.find(i => i.id === item.id)?.state, "failed");
    assert.equal(f.library.manifest().entries.length, 1);
    await f.library.remove(item.id);
    await assert.rejects(f.library.remove("builtin"), /默认动画/);
    await assert.rejects(f.library.asset("../secret", "frames"), /编号/);
  } finally { await f.cleanup(); }
});

test("an interrupted upload is removed and stale reordering cannot overwrite newer catalog changes", async () => {
  const f = await fixture();
  try {
    const revision = f.library.snapshot().revision;
    const stream = Readable.from((async function* () { yield Buffer.from("partial"); throw new Error("disconnected"); })());
    await assert.rejects(f.library.upload(stream, "clip.webm", options), /disconnected/);
    assert.equal(f.library.snapshot().items.length, 1);
    await assert.rejects(f.library.reorder(["builtin"], revision), /更新/);
    assert.throws(() => animationOptions({ ...options, duration: 20 }), /0.5–4/);
    assert.throws(() => animationOptions({ ...options, label: "超出固定字库" }), /英文字母/);
  } finally { await f.cleanup(); }
});

test("HTTP upload returns an independent job, supports browser byte ranges, and rejects cross-origin writes", async () => {
  const f = await fixture(), app = Fastify();
  try {
    await registerAnimationRoutes(app, f.library);
    const payload = Buffer.from('--BOUNDARY\r\nContent-Disposition: form-data; name="file"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\nvideo\r\n--BOUNDARY--\r\n');
    const response = await app.inject({ method: "POST", url: "/api/animations?title=clip&label=CLIP&duration=0.5", headers: { "content-type": "multipart/form-data; boundary=BOUNDARY" }, payload });
    assert.equal(response.statusCode, 202, response.body);
    const id = response.json().item.id;
    await f.library.idle();
    const range = await app.inject({ url: `/api/animations/assets/${id}/frames`, headers: { range: "bytes=0-15" } });
    assert.equal(range.statusCode, 206);
    assert.equal(range.rawPayload.length, 16);
    const invalid = await app.inject({ url: `/api/animations/assets/${id}/frames`, headers: { range: "bytes=999999999-" } });
    assert.equal(invalid.statusCode, 416);
    const crossOrigin = await app.inject({ method: "DELETE", url: `/api/animations/${id}`, headers: { origin: "https://unrelated.example" } });
    assert.equal(crossOrigin.statusCode, 403);
  } finally { await app.close(); await f.cleanup(); }
});
