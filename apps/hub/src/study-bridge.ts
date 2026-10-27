import { randomBytes } from "node:crypto";
import { StudyController, type StudyAction, type StudyActionResult, type StudyWrite } from "./study-control.js";

export type StudySocket = { readyState: number; send(data: string): void };
type Task = { id: number; title: string; done: boolean | number; minutes: number };
type Focus = { session_id?: string | null; revision: number; status: string; phase: string; mode: string; elapsed_seconds: number; remaining_seconds: number; task: { title: string } | null };
export type StudySnapshot = { protocol: number; date: string; tasks: Task[]; completed: number; total: number; session: Focus };
const statuses = new Set(["idle", "running", "paused", "ready"]);
const text = (value: string, count: number) => Array.from(value.replace(/[\u0000-\u001f]/g, " ")).slice(0, count).join("");

export function validateStudySnapshot(value: unknown): StudySnapshot {
  const v = value as StudySnapshot;
  if (!v || v.protocol !== 2 || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Array.isArray(v.tasks) || v.tasks.length > 1000 ||
      !v.session || !statuses.has(v.session.status) || !Number.isSafeInteger(v.session.revision) ||
      (v.session.session_id != null && (typeof v.session.session_id !== "string" || !/^[A-Za-z0-9_-]{1,36}$/.test(v.session.session_id))) ||
      ![v.session.elapsed_seconds, v.session.remaining_seconds].every(n => Number.isFinite(n) && n >= 0) ||
      !["focus", "break"].includes(v.session.phase) || !["pomodoro", "stopwatch"].includes(v.session.mode) ||
      (v.session.task !== null && typeof v.session.task?.title !== "string") ||
      !v.tasks.every(t => Number.isSafeInteger(t.id) && typeof t.title === "string" && [true, false, 0, 1].includes(t.done) && Number.isFinite(t.minutes) && t.minutes >= 0)) {
    throw new Error("Invalid study projection");
  }
  return v;
}

/** Every UTF-8 frame fits the firmware's existing 512-byte receive buffer. */
export function studyFrames(snapshot: StudySnapshot | null, page: number, batch: string, enabled = true, controls = false): string[] {
  if (!enabled) snapshot = null;
  const tasks = snapshot?.tasks ?? [];
  const pages = Math.max(1, Math.ceil(tasks.length / 3));
  const selectedPage = Math.max(0, Math.min(pages - 1, page));
  const selected = tasks.slice(selectedPage * 3, selectedPage * 3 + 3);
  const s = snapshot?.session;
  const header = { type: "study", version: 1, batch, enabled, controls, online: !!snapshot, date: snapshot?.date ?? "", total: tasks.length,
    completed: tasks.filter(t => !!t.done).length, page: selectedPage, pages, rows: selected.length,
    focus: { session_id: s?.session_id ?? "", revision: s?.revision ?? 0, status: s?.status ?? "idle", phase: s?.phase ?? "focus", mode: s?.mode ?? "pomodoro",
      elapsed: Math.floor(s?.elapsed_seconds ?? 0), remaining: Math.floor(s?.remaining_seconds ?? 0), title: text(s?.task?.title ?? "", 32) } };
  const values: Array<Record<string, unknown>> = [header, ...selected.map((t, row) => ({
    type: "studyTask", version: 1, batch, row, id: t.id, title: text(t.title, 64), done: !!t.done, minutes: Math.round(t.minutes)
  }))];
  return values.map(value => {
    // JSON escaping and non-BMP characters affect byte size, so measure encoded data.
    while (Buffer.byteLength(JSON.stringify(value), "utf8") >= 512) {
      const target = value.type === "study" ? (value.focus as { title: string }) : value;
      const title = target.title as string;
      if (!title.length) throw new Error("Study frame exceeds receive budget");
      target.title = Array.from(title).slice(0, -1).join("");
    }
    return JSON.stringify(value);
  });
}

export class StudyBridge {
  private readonly clients = new Map<StudySocket, number>();
  private readonly sent = new Map<StudySocket, Map<string, Record<string, unknown>>>();
  private readonly receipts = new Map<StudySocket, Record<string, unknown>>();
  private snapshot: StudySnapshot | null = null;
  private busy = false;
  private generation = 0;
  private sequence = 0;
  private readonly epoch = randomBytes(5).toString("hex");
  private lastSuccess: string | null = null;
  private lastReadAt = 0;
  private sourceError: string | null = null;
  private controlsEnabled = false;
  private readonly controllers = new Set<StudySocket>();
  private readonly contexts = new Map<StudySocket, Array<{ batch: string; at: number; snapshot: StudySnapshot; ids: number[] }>>();
  private readonly commands = new Map<StudySocket, Map<string, Promise<StudyActionResult>>>();
  private readonly controller: StudyController;
  constructor(private enabled = false, private readonly read: () => Promise<unknown> = async () => {
    const response = await fetch("http://127.0.0.1:8000/api/device/study", { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error(`Study service HTTP ${response.status}`);
    return response.json();
  }, private readonly clock = () => Date.now(), write?: StudyWrite) { this.controller = new StudyController(this.read, write); }

  status() { return { enabled: this.enabled, controlsEnabled: this.controlsEnabled, online: this.enabled && this.snapshot !== null, capableDevices: this.clients.size, lastSuccess: this.lastSuccess, sourceError: this.sourceError,
    receipts: [...this.receipts.values()].map(r => ({ ...r, fresh: this.enabled && this.snapshot !== null && this.clock() - Number(r.receivedAtMs) < 8000 })) }; }
  setEnabled(enabled: boolean) {
    this.enabled = enabled; this.generation++; this.snapshot = null; this.lastReadAt = 0; this.sourceError = null;
    this.sent.clear(); this.receipts.clear(); this.contexts.clear();
    this.sendAll();
  }
  setControlsEnabled(enabled: boolean) { this.controlsEnabled = enabled; this.contexts.clear(); this.sendAll(); }
  /** Caller must validate the device hello before opting in with study-v1. */
  register(socket: StudySocket, capable: boolean, controls = false) {
    if (!capable) { this.remove(socket); return; }
    if (controls) this.controllers.add(socket);
    else this.controllers.delete(socket);
    if (this.clients.has(socket)) return;
    this.clients.set(socket, 0);
    if (this.enabled) this.send(socket);
  }
  remove(socket: StudySocket) { this.clients.delete(socket); this.sent.delete(socket); this.receipts.delete(socket); this.controllers.delete(socket); this.contexts.delete(socket); this.commands.delete(socket); }
  handleMessage(socket: StudySocket, raw: string): boolean {
    if (!this.enabled || !this.clients.has(socket) || Buffer.byteLength(raw, "utf8") >= 512) return false;
    let v: { type?: string; page?: number; batch?: string; version?: number; id?: string; action?: string; taskId?: number };
    try { v = JSON.parse(raw); } catch { return false; }
    if (v?.type === "studyAction") {
      if (v.version !== 1 || typeof v.id !== "string" || !/^[A-Za-z0-9_-]{1,48}$/.test(v.id) ||
          !["start", "pause", "resume", "end", "done"].includes(v.action ?? "") ||
          ((v.action === "start" || v.action === "done") && (!Number.isSafeInteger(v.taskId) || v.taskId! < 0))) return false;
      const command = v as StudyAction;
      const reply = (r: StudyActionResult) => { if (socket.readyState === 1) { try { socket.send(JSON.stringify(r)); } catch { this.remove(socket); } } };
      const known = this.commands.get(socket)?.get(command.id);
      if (known) { void known.then(reply); return true; }
      const context = this.contexts.get(socket)?.find(c => c.batch === v.batch && this.clock()-c.at < 5000);
      if (!this.controlsEnabled || !this.controllers.has(socket) || !context || !this.snapshot || this.sourceError) {
        reply({ type: "studyActionResult", id: command.id, status: "conflict" }); return true;
      }
      const generation = ++this.generation; // Invalidate an earlier poll before the write.
      const pending = this.controller.execute(command, context.snapshot, context.ids).then(async result => {
        if (this.enabled && generation === this.generation) {
          try {
            const next = validateStudySnapshot(await this.read());
            if (this.enabled && generation === this.generation) {
              this.snapshot = next; this.lastReadAt = this.clock(); this.sourceError = null; this.sendAll();
            }
          } catch { /* The receipt reports the write; freshness continues aging. */ }
        }
        return result;
      });
      const history = this.commands.get(socket) ?? new Map<string, Promise<StudyActionResult>>();
      history.set(command.id, pending); this.commands.set(socket, history);
      while (history.size > 128) history.delete(history.keys().next().value!);
      void pending.then(reply); return true;
    }
    if (v?.type === "studyAck") {
      if (v.version !== 1 || typeof v.batch !== "string") return false;
      const pending = this.sent.get(socket);
      const sample = pending?.get(v.batch);
      if (!sample) return false;
      this.receipts.set(socket, { ...sample, receivedAtMs: this.clock(), receivedAt: new Date(this.clock()).toISOString() });
      // A repeated receipt must not keep a stale sample looking fresh.
      for (const batch of pending!.keys()) { pending!.delete(batch); if (batch === v.batch) break; }
      return true;
    }
    if (v?.type !== "studyPage" || !Number.isSafeInteger(v.page) || v.page! < 0 || v.page! > 333) return false;
    this.clients.set(socket, v.page!); this.send(socket); return true;
  }
  async tick() {
    if (!this.enabled || this.busy) return;
    this.busy = true;
    const generation = this.generation;
    let publish = false;
    try {
      const next = validateStudySnapshot(await this.read());
      if (generation === this.generation && this.enabled) { this.snapshot = next; this.lastReadAt = this.clock(); this.lastSuccess = new Date(this.lastReadAt).toISOString(); this.sourceError = null; publish = true; }
    } catch (error) {
      if (generation === this.generation) {
        this.sourceError = error instanceof Error ? `${error.name}: ${error.message}` : "Study source unavailable";
        // A transient timeout must not flash offline/online. Do not resend old
        // samples either: the device's own five-second freshness clock keeps aging.
        if (!this.snapshot || this.clock() - this.lastReadAt >= 5000) { this.snapshot = null; publish = true; }
      }
    }
    finally { this.busy = false; if (publish && generation === this.generation && this.enabled) this.sendAll(); }
  }
  private send(socket: StudySocket) {
    if (socket.readyState !== 1) return;
    if (this.enabled && this.sourceError && this.snapshot) return;
    try {
      const page = this.clients.get(socket) ?? 0;
      const frames = studyFrames(this.snapshot, page, `${this.epoch}-${++this.sequence}`, this.enabled, this.controlsEnabled && this.controllers.has(socket));
      const h = JSON.parse(frames[0]);
      if (this.snapshot && this.enabled) {
        const contexts = this.contexts.get(socket) ?? [];
        contexts.push({ batch: h.batch, at: this.clock(), snapshot: this.snapshot, ids: this.snapshot.tasks.slice(h.page*3,h.page*3+3).map(t => t.id) });
        this.contexts.set(socket, contexts.slice(-4));
      }
      const pending = this.sent.get(socket) ?? new Map<string, Record<string, unknown>>();
      pending.set(h.batch, { batch: h.batch, date: h.date, total: h.total, completed: h.completed, page: h.page, rows: h.rows, revision: h.focus.revision, focusStatus: h.focus.status, controls: h.controls });
      while (pending.size > 4) pending.delete(pending.keys().next().value!);
      this.sent.set(socket, pending);
      for (const frame of frames) socket.send(frame);
    }
    catch { this.remove(socket); }
  }
  private sendAll() { for (const socket of this.clients.keys()) this.send(socket); }
}
