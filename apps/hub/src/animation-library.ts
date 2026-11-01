import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { crc32 } from "node:zlib";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { ConfigWriteQueue } from "./config-write-queue.js";

export const ANIMATION_LIMITS = { count: 8, uploadBytes: 128 * 1024 * 1024, duration: 4, fps: 30,
  width: 198, height: 150, maxFrameBytes: 7_128_000 } as const;
export type AnimationState = "queued" | "converting" | "ready" | "failed";
export interface AnimationItem {
  id: string; title: string; label: string; state: AnimationState; error?: string;
  duration: number; start: number; createdAt: string; bytes?: number; crc?: number; frames?: number;
  builtin?: boolean;
}
export interface AnimationOptions { title: string; label: string; start: number; duration: number }
export interface AnimationSnapshot { revision: number; items: AnimationItem[]; limits: typeof ANIMATION_LIMITS }
export type AnimationConverter = (input: string, output: string, background: string, options: AnimationOptions) => Promise<{ frames: number }>;
const idPattern = /^(?:builtin|[a-f0-9]{16})$/;
export function animationOptions(input: Record<string, unknown>): AnimationOptions {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const start = Number(input.start ?? 0), duration = Number(input.duration ?? 4);
  if (!title || title.length > 60 || /[\x00-\x1f]/.test(title)) throw new Error("名称为 1–60 个字符");
  if (!/^[A-Za-z0-9 _-]{1,16}$/.test(label)) throw new Error("小屏名称请用 1–16 个英文字母、数字、空格或短横线");
  if (!Number.isFinite(start) || start < 0 || start > 86400) throw new Error("起点须在 0–86400 秒内");
  if (!Number.isFinite(duration) || duration < .5 || duration > ANIMATION_LIMITS.duration) throw new Error("每段动画为 0.5–4 秒");
  return { title, label, start, duration };
}

/** Persistent catalog. One converter at a time; only complete exports enter the device manifest. */
export class AnimationLibrary {
  private items: AnimationItem[] = [];
  private revision = 1;
  private writes = new ConfigWriteQueue();
  private work: Promise<void> = Promise.resolve();
  private background?: { bytes: number; crc: number };
  constructor(readonly root: string, readonly publicRoot: string, private convert: AnimationConverter) {}
  private get catalogPath() { return path.join(this.root, "catalog.json"); }
  private get backgroundPath() { return path.join(this.publicRoot, "motion-assets/crt-background.rgb565"); }
  async init() {
    await mkdir(this.root, { recursive: true });
    try {
      const disk = JSON.parse(await readFile(this.catalogPath, "utf8"));
      if (!Number.isSafeInteger(disk.revision) || disk.revision < 1 || !Array.isArray(disk.items) || disk.items.length > 8) throw new Error("Invalid animation catalog");
      const seen = new Set<string>();
      this.items = disk.items.map((item: AnimationItem) => {
        if (!idPattern.test(item.id) || seen.has(item.id)) throw new Error("Invalid animation ID");
        seen.add(item.id); animationOptions(item as unknown as Record<string, unknown>);
        if (!["ready", "failed", "queued", "converting"].includes(item.state)) throw new Error("Invalid animation state");
        return item.state === "queued" || item.state === "converting"
          ? { ...item, state: "failed" as const, error: "上次转换被中断，请删除后重新上传" } : item;
      });
      this.revision = disk.revision;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      const bg = await readFile(this.backgroundPath);
      if (bg.length !== 480 * 320 * 2) throw new Error("Invalid CRT background size");
      this.background = { bytes: bg.length, crc: crc32(bg) };
      const frames = await readFile(path.join(this.publicRoot, "motion-assets/crt-window-30fps.rgb565"));
      if (frames.length && frames.length % (198 * 150 * 2) === 0 && frames.length <= ANIMATION_LIMITS.maxFrameBytes && !this.items.some(i => i.id === "builtin")) {
        this.items.unshift({ id: "builtin", title: "现有 CRT 动画", label: "ORIGINAL", state: "ready", builtin: true,
          duration: frames.length / (198 * 150 * 2 * 30), start: 0, createdAt: new Date().toISOString(),
          bytes: frames.length, crc: crc32(frames), frames: frames.length / (198 * 150 * 2) });
        this.items = this.items.slice(0, 8);
      }
    } catch { /* A source-only installation can still run the dashboard without optional media. */ }
    await this.persist();
  }
  snapshot(): AnimationSnapshot { return structuredClone({ revision: this.revision, items: this.items, limits: ANIMATION_LIMITS }); }
  private async persist() {
    const temp = this.catalogPath + ".tmp";
    await writeFile(temp, JSON.stringify({ revision: this.revision, items: this.items }) + "\n");
    await rename(temp, this.catalogPath);
  }
  private async change(operation: () => void) {
    return this.writes.run(async () => {
      const before = structuredClone(this.items), revision = this.revision;
      operation(); this.revision++;
      try { await this.persist(); } catch (error) { this.items = before; this.revision = revision; throw error; }
    });
  }
  async upload(stream: Readable, filename: string, input: Record<string, unknown>) {
    const options = animationOptions(input);
    const extension = path.extname(filename).toLowerCase();
    if (![".mp4", ".webm", ".gif", ".mov", ".mkv"].includes(extension)) throw new Error("请选择 MP4、WebM、GIF、MOV 或 MKV 文件");
    if (!this.background) throw new Error("缺少 CRT 房间背景，请先恢复现有动画资源");
    const id = randomBytes(8).toString("hex"), folder = path.join(this.root, id);
    const item: AnimationItem = { id, ...options, state: "queued", createdAt: new Date().toISOString() };
    await this.change(() => {
      if (this.items.length >= ANIMATION_LIMITS.count) throw new Error("动画库最多 8 段，请先删除不用的动画");
      if (this.items.some(i => i.state === "queued" || i.state === "converting")) throw new Error("有文件正在上传或转换，请完成后再上传");
      this.items.push(item);
    });
    const source = path.join(folder, "upload" + extension);
    try {
      await mkdir(folder, { recursive: true });
      let bytes = 0;
      const count = (chunk: Buffer) => { bytes += chunk.length; if (bytes > ANIMATION_LIMITS.uploadBytes) stream.destroy(new Error("文件超过 128 MB")); };
      stream.on("data", count);
      try { await pipeline(stream, createWriteStream(source, { flags: "wx" })); } finally { stream.off("data", count); }
      if ((stream as Readable & { truncated?: boolean }).truncated || !bytes) throw new Error("上传不完整或文件为空");
    } catch (error) {
      await this.change(() => { this.items = this.items.filter(i => i.id !== id); });
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
    this.work = this.work.catch(() => undefined).then(() => this.process(id, source, folder, options));
    // Retain the rejected promise for idle()/shutdown diagnostics without an unhandled rejection.
    void this.work.catch(() => undefined);
    return structuredClone(item);
  }
  private async process(id: string, source: string, folder: string, options: AnimationOptions) {
    try {
      await this.change(() => { this.items.find(i => i.id === id)!.state = "converting"; });
      const result = await this.convert(source, folder, this.backgroundPath, options);
      const payload = await readFile(path.join(folder, "frames.raw"));
      if (result.frames < 1 || result.frames > 120 || payload.length !== result.frames * 198 * 150 * 2) throw new Error("转换结果尺寸或长度异常");
      await this.change(() => Object.assign(this.items.find(i => i.id === id)!, {
        state: "ready", duration: result.frames / 30, frames: result.frames, bytes: payload.length, crc: crc32(payload)
      }));
    } catch (error) {
      await this.change(() => {
        const item = this.items.find(i => i.id === id);
        if (item) { item.state = "failed"; item.error = error instanceof Error ? error.message.slice(0, 160) : "转换失败"; }
      });
    } finally { await rm(source, { force: true }); }
  }
  async idle() { await this.work; }
  async remove(id: string) {
    this.require(id);
    await this.change(() => {
      const item = this.require(id);
      if (item.builtin) throw new Error("保留现有默认动画作为回退");
      if (item.state === "queued" || item.state === "converting") throw new Error("转换完成后才能删除");
      this.items = this.items.filter(i => i.id !== id);
    });
    // Delete only this library's validated, generated-ID folder, never the uploaded original path.
    await rm(path.join(this.root, id), { recursive: true, force: true });
  }
  async reorder(ids: unknown, revision: unknown) {
    await this.change(() => {
      if (revision !== this.revision) throw new Error("动画库已更新，请刷新后再排序");
      if (!Array.isArray(ids) || ids.length !== this.items.length || new Set(ids).size !== ids.length || ids.some(id => !this.items.some(i => i.id === id))) throw new Error("排序必须完整包含当前动画");
      this.items = ids.map(id => this.require(id));
    });
  }
  private require(id: string) {
    if (!idPattern.test(id)) throw new Error("无效动画编号");
    const item = this.items.find(i => i.id === id);
    if (!item) throw new Error("动画不存在");
    return item;
  }
  async asset(id: string, kind: string) {
    if (id === "background" && kind === "frames" && this.background) return { path: this.backgroundPath, type: "application/octet-stream", bytes: this.background.bytes };
    const item = this.require(id);
    if (item.state !== "ready") throw new Error("动画尚未就绪");
    if (!["frames", "preview", "poster"].includes(kind)) throw new Error("无效资源类型");
    const source = item.builtin
      ? path.join(this.publicRoot, kind === "frames" ? "motion-assets/crt-window-30fps.rgb565" : kind === "preview" ? "motion-review/crt-scene-preview.mp4" : "motion-review/crt-room-original.png")
      : path.join(this.root, id, kind === "frames" ? "frames.raw" : kind === "preview" ? "preview.mp4" : "poster.jpg");
    return { path: source, bytes: (await stat(source)).size, type: kind === "frames" ? "application/octet-stream" : kind === "preview" ? "video/mp4" : item.builtin ? "image/png" : "image/jpeg" };
  }
  manifest() {
    return { schemaVersion: 1, revision: this.revision,
      background: this.background ? { bytes: this.background.bytes, crc: this.background.crc, remote: "/api/animations/assets/background/frames" } : null,
      entries: this.items.filter(i => i.state === "ready").map(i => ({ id: i.id, label: i.label,
        width: 198, height: 150, x: 145, y: 82, fps: 30, bytes: i.bytes, crc: i.crc,
        remote: `/api/animations/assets/${i.id}/frames` })) };
  }
}
