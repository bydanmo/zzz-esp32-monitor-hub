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

export interface ExamTargetDraft {
  base: string;
  value: string;
  loaded: boolean;
  pendingSave: boolean;
  status: string;
}

export function createExamTargetDraft(): ExamTargetDraft {
  return { base: "", value: "", loaded: false, pendingSave: false, status: "等待加载考试目标" };
}

export function receiveExamTarget(state: ExamTargetDraft, examAt: string | null,
  status: string): ExamTargetDraft {
  const value = examTargetToLocalInput(examAt);
  if (state.pendingSave) return state;
  if (value === state.base && state.loaded) return state;
  const dirty = state.value !== state.base;
  return {
    ...state,
    base: value,
    value: dirty ? state.value : value,
    loaded: true,
    status: dirty ? "Hub 目标已读取，未保存的输入已保留" : status
  };
}

export function acceptSavedExamTarget(state: ExamTargetDraft, submittedValue: string,
  examAt: string | null, status: string): ExamTargetDraft {
  const value = examTargetToLocalInput(examAt);
  const editedDuringSave = state.value !== submittedValue;
  return {
    base: value,
    value: editedDuringSave ? state.value : value,
    loaded: true,
    pendingSave: false,
    status: editedDuringSave ? "本次目标已保存；后续修改仍未保存" : status
  };
}
