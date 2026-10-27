import { validateStudySnapshot, type StudySnapshot } from "./study-bridge.js";

export type StudyAction = { id: string; action: "start" | "pause" | "resume" | "end" | "done"; taskId?: number };
export type StudyActionResult = { type: "studyActionResult"; id: string; status: "ok" | "conflict" | "error" | "unknown" };
export type StudyWrite = (path: string, body: Record<string, unknown>) => Promise<void>;

export async function writeStudy(path: string, body: Record<string, unknown>) {
  const response = await fetch(`http://127.0.0.1:8000${path}`, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new StudyHttpError(response.status);
}
export class StudyHttpError extends Error { constructor(public readonly status: number) { super(`Study HTTP ${status}`); } }

/** One authoritative PC write at a time; no optimistic learning records. */
export class StudyController {
  private busy = false;
  constructor(private readonly read: () => Promise<unknown>, private readonly write: StudyWrite = writeStudy) {}
  async execute(command: StudyAction, shown: StudySnapshot, visibleIds: number[]): Promise<StudyActionResult> {
    const result = (status: StudyActionResult["status"]): StudyActionResult => ({ type: "studyActionResult", id: command.id, status });
    if (this.busy) return result("conflict");
    this.busy = true;
    try {
      const current = validateStudySnapshot(await this.read());
      if (shown.date !== current.date) return result("conflict");
      if (command.action === "done" || command.action === "start") {
        const task = current.tasks.find(t => t.id === command.taskId);
        if (!task || !visibleIds.includes(task.id)) return result("conflict");
        if (command.action === "done") {
          if (!task.done) await this.write(`/api/tasks/${task.id}/done`, {});
          // No planned minutes, timer minutes or mastery are inferred here.
          return result("ok");
        }
        if (task.done) return result("conflict");
      }
      const s = current.session;
      if (s.revision !== shown.session.revision ||
          (command.action === "start" ? s.status !== "idle" :
           command.action === "pause" ? s.status !== "running" : command.action === "end" ? s.status === "idle" : s.status !== "paused")) return result("conflict");
      await this.write("/api/focus/action", { request_id: `esp32:${command.id}`, revision: s.revision,
        action: command.action, ...(command.action === "start" ? { task_id: command.taskId, mode: "pomodoro", phase: "focus", duration_seconds: 1500 } : {}) });
      return result("ok");
    } catch (error) {
      return result(error instanceof StudyHttpError ? error.status === 409 ? "conflict" : "error" : "unknown");
    } finally { this.busy = false; }
  }
}
