import { useEffect, useRef, useState } from "react";
import { saveExamTarget } from "../../services/hub-api";
import { examTargetToLocalInput, localInputToExamTarget } from "../../state/exam-target";
import type { ExamTargetResponse } from "../../types";

import { isDemoMode } from "../../services/demo";

export function ExamTargetEditor({ response, onSaved }: {
  response: ExamTargetResponse | null;
  onSaved: (response: ExamTargetResponse) => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("等待加载考试目标");
  const skipNextRemoteSync = useRef(false);

  useEffect(() => {
    if (!response) return;
    if (skipNextRemoteSync.current) {
      skipNextRemoteSync.current = false;
      return;
    }
    setValue(examTargetToLocalInput(response.target.examAt));
    setStatus(isDemoMode() ? "示例考试目标 · 演示模式只读，不持久化" : response.target.examAt ? "当前目标已由 Hub 持久化" : "尚未设置考试目标");
  }, [response]);

  const persist = async (examAt: string | null) => {
    if (saving) return;
    setSaving(true);
    setStatus("正在保存到 Hub…");
    try {
      const next = await saveExamTarget(examAt);
      setValue(examTargetToLocalInput(next.target.examAt));
      skipNextRemoteSync.current = true;
      onSaved(next);
      setStatus(examAt ? "已保存到 Hub，倒计时随遥测更新" : "已清除，倒计时将显示未提供");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    try {
      void persist(localInputToExamTarget(value));
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "请选择有效的考试日期和时间");
    }
  };

  return <article className="exam-target-card">
    <div><p>考试目标</p><strong>{response?.target.examAt ? "已设置" : "未设置"}</strong></div>
    <label>
      <span>本地日期与时间</span>
      <input disabled={isDemoMode()} type="datetime-local" step="60" value={value}
        onChange={(event) => setValue(event.target.value)} />
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
