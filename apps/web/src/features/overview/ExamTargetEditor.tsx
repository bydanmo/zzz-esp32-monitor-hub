import { useEffect, useState } from "react";
import { saveExamTarget } from "../../services/hub-api";
import { acceptSavedExamTarget, createExamTargetDraft, localInputToExamTarget, receiveExamTarget } from "../../state/exam-target";
import type { ExamTargetResponse } from "../../types";

import { isDemoMode } from "../../services/demo";

export function ExamTargetEditor({ response, onSaved }: {
  response: ExamTargetResponse | null;
  onSaved: (response: ExamTargetResponse) => void;
}) {
  const [draft, setDraft] = useState(createExamTargetDraft);
  const { value, pendingSave: saving, status } = draft;

  useEffect(() => {
    if (!response) return;
    setDraft(current => receiveExamTarget(current, response.target.examAt,
      isDemoMode() ? "示例考试目标 · 演示模式只读，不持久化" : response.target.examAt ? "当前目标已由 Hub 持久化" : "尚未设置考试目标"));
  }, [response]);

  const persist = async (examAt: string | null) => {
    if (saving) return;
    const submittedValue = value;
    setDraft(current => ({ ...current, pendingSave: true, status: "正在保存到 Hub…" }));
    try {
      const next = await saveExamTarget(examAt);
      setDraft(current => acceptSavedExamTarget(current, submittedValue, next.target.examAt,
        examAt ? "已保存到 Hub，倒计时随遥测更新" : "已清除，倒计时将显示未提供"));
      onSaved(next);
    } catch (cause) {
      setDraft(current => ({ ...current, pendingSave: false,
        status: cause instanceof Error ? cause.message : "保存失败" }));
    }
  };

  const save = () => {
    try {
      void persist(localInputToExamTarget(value));
    } catch (cause) {
      setDraft(current => ({ ...current,
        status: cause instanceof Error ? cause.message : "请选择有效的考试日期和时间" }));
    }
  };

  return <article className="exam-target-card">
    <div><p>考试目标</p><strong>{response?.target.examAt ? "已设置" : "未设置"}</strong></div>
    <label>
      <span>本地日期与时间</span>
      <input disabled={isDemoMode()} type="datetime-local" step="60" value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(current => ({ ...current, value: nextValue, status: "有未保存的目标修改" }));
        }} />
    </label>
    <p className="exam-target-status" aria-live="polite">{status}</p>
    <div className="exam-target-actions">
      <button type="button" className="secondary" disabled={isDemoMode() || saving || response === null}
        onClick={() => void persist(null)}>清除</button>
      <button type="button" className="primary" disabled={isDemoMode() || saving || !value}
        onClick={save}>{saving ? "保存中…" : "保存目标"}</button>
    </div>
  </article>;
}
