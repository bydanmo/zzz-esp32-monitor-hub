import type { DeviceDisplayConfig } from "../types";
import { sameEditableConfig } from "./ui-state";

export interface DraftState {
  base: DeviceDisplayConfig;
  draft: DeviceDisplayConfig;
  conflict: DeviceDisplayConfig | null;
  status: string;
  pendingSave?: boolean;
}

export const draftStorageKey = "esp32-monitor.display-draft.v1";

export function createDraftState(remote: DeviceDisplayConfig): DraftState {
  return { base: remote, draft: remote, conflict: null, status: "未修改" };
}

export function isDraftDirty(state: DraftState): boolean {
  return !sameEditableConfig(state.base, state.draft);
}

export function receiveRemote(state: DraftState, remote: DeviceDisplayConfig): DraftState {
  const newestRevision = Math.max(state.base.revision, state.conflict?.revision ?? 0);
  if (remote.revision < newestRevision) return state;
  if (remote.revision === state.base.revision && sameEditableConfig(remote, state.base)) return state;
  if (isDraftDirty(state) || state.pendingSave) return { ...state, conflict: remote, status: "远端配置已更新" };
  return { base: remote, draft: remote, conflict: null, status: "已载入远端配置" };
}

export function loadRemote(state: DraftState): DraftState {
  if (!state.conflict) return state;
  return { base: state.conflict, draft: state.conflict, conflict: null, status: "已载入远端配置" };
}

export function keepLocal(state: DraftState): DraftState {
  if (!state.conflict) return state;
  return {
    base: state.conflict,
    draft: { ...state.draft, revision: state.conflict.revision },
    conflict: null,
    status: "保留本地草稿，尚未应用"
  };
}

/** A successful request only commits its submitted snapshot. Later edits stay
 * dirty, and a newer remote revision still requires conflict resolution. */
export function acceptSavedDraft(state: DraftState, submitted: DeviceDisplayConfig,
  saved: DeviceDisplayConfig, status: string): DraftState {
  if (saved.revision < state.base.revision) return { ...state, pendingSave: false };
  const editedDuringSave = !sameEditableConfig(state.draft, submitted);
  const conflict = state.conflict && state.conflict.revision > saved.revision ? state.conflict : null;
  return {
    base: saved,
    draft: editedDuringSave ? { ...state.draft, revision: saved.revision } : saved,
    conflict,
    pendingSave: false,
    status: conflict ? "远端配置已更新，请先处理冲突"
      : editedDuringSave ? "本次提交已保存；后续修改仍在草稿中" : status
  };
}

export function discardDraft(state: DraftState): DraftState {
  const remote = state.conflict ?? state.base;
  return { base: remote, draft: remote, conflict: null, status: "已放弃草稿，恢复 Hub 配置" };
}
