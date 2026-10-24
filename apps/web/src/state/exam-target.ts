export function examTargetToLocalInput(examAt: string | null): string {
  if (examAt === null) return "";
  const date = new Date(examAt);
  if (!Number.isFinite(date.getTime())) return "";
  const localMilliseconds = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(localMilliseconds).toISOString().slice(0, 16);
}

export function localInputToExamTarget(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("请选择有效的考试日期和时间");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("请选择有效的考试日期和时间");
  }
  return date.toISOString();
}
