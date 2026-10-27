import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The countdown target. `null` means "not configured", which is reported as 未提供
 *  rather than as 0: a fake zero would read as "the exam is today". */
export interface ExamTarget {
  examAt: string | null;
}

const directory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(directory, "../data");
const configPath = path.join(dataDirectory, "exam-target.json");
const temporaryPath = path.join(dataDirectory, "exam-target.tmp.json");
/* An explicit offset (or Z) is required: a bare local time would silently mean a
 * different instant on another machine or after a timezone change. */
const targetPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function validateExamTarget(input: unknown): ExamTarget {
  if (typeof input !== "object" || input === null) {
    throw new Error("考试目标配置必须是对象");
  }
  const examAt = (input as { examAt?: unknown }).examAt;
  if (examAt === null || examAt === undefined) return { examAt: null };
  if (typeof examAt !== "string" || !targetPattern.test(examAt)) {
    throw new Error("examAt 必须是带时区的 ISO 8601 时间，例如 2027-12-25T09:00:00+08:00");
  }
  const year = Number(examAt.slice(0, 4));
  const month = Number(examAt.slice(5, 7));
  const day = Number(examAt.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Date.parse normalizes e.g. February 30 instead of rejecting it.
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
      || Number(examAt.slice(11, 13)) > 23 || !Number.isFinite(Date.parse(examAt))) {
    throw new Error("examAt 不是有效时间");
  }
  return { examAt };
}

export function examSecondsRemaining(target: ExamTarget, now: Date = new Date()): number | null {
  if (target.examAt === null) return null;
  const seconds = Math.floor((Date.parse(target.examAt) - now.getTime()) / 1000);
  return seconds > 0 ? seconds : 0;
}

export async function loadExamTarget(): Promise<ExamTarget> {
  try {
    const stored = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    return validateExamTarget(stored);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return { examAt: null };
    /* A broken file must not look like "no exam scheduled"; say so once at start. */
    console.warn(`exam-target.json 无法使用，倒计时按未配置处理：${
      error instanceof Error ? error.message : String(error)}`);
    return { examAt: null };
  }
}

export async function saveExamTarget(target: ExamTarget): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(target, null, 2)}\n`, "utf8");
  await rename(temporaryPath, configPath);
}
