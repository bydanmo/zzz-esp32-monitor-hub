import assert from "node:assert/strict";
import test from "node:test";
import { defaultDeviceConfig } from "../apps/web/src/state/default-config.ts";
import { acceptSavedDraft, createDraftState, discardDraft, isDraftDirty, receiveRemote } from "../apps/web/src/state/draft-store.ts";
import { availablePreviewPages, withPreviewPage } from "../apps/web/src/state/preview-config.ts";

const config = () => structuredClone(defaultDeviceConfig);

test("预览浏览不改写场景模板，也不产生可保存的更改", () => {
  const original = config();
  const before = structuredClone(original);
  for (const page of availablePreviewPages(original.visible)) {
    const preview = withPreviewPage(original, page);
    assert.equal(preview.page, page);
    assert.equal(preview.scenes[0].page, "overview");
    assert.deepEqual(original, before);
    assert.equal(isDraftDirty(createDraftState(original)), false);
  }
});

test("隐藏指标后预览回退到可用模板，空配置仍可显示总览空态", () => {
  const original = config();
  original.page = "study";
  original.visible = { cpu: false, memory: false, exam: true };
  assert.deepEqual(availablePreviewPages(original.visible), ["overview", "study"]);
  assert.equal(withPreviewPage(original, "system").page, "study");
  original.visible.exam = false;
  assert.equal(withPreviewPage(original, "study").page, "overview");
});

test("保存返回后，只将已提交快照标记为已保存", () => {
  const initial = config();
  const submitted = { ...initial, title: "已提交" };
  const saved = { ...submitted, revision: 2 };
  const current = { ...createDraftState(initial), draft: submitted, pendingSave: true };
  const done = acceptSavedDraft(current, submitted, saved, "Hub 已保存");
  assert.equal(done.base.revision, 2);
  assert.equal(isDraftDirty(done), false);
  assert.equal(done.pendingSave, false);
  assert.equal(done.status, "Hub 已保存");
});

test("保存期间继续换色和切换场景，新增编辑不会被成功响应覆盖", () => {
  const initial = config();
  const submitted = { ...initial, title: "已提交" };
  const edited = { ...submitted, title: "继续修改", theme: { ...initial.theme, accent: "#F5ED00" } };
  const current = { ...createDraftState(initial), draft: edited, pendingSave: true };
  const done = acceptSavedDraft(current, submitted, { ...submitted, revision: 2 }, "Hub 已保存");
  assert.equal(done.draft.title, "继续修改");
  assert.equal(done.draft.theme.accent, "#F5ED00");
  assert.equal(done.draft.revision, 2);
  assert.equal(isDraftDirty(done), true);
  assert.match(done.status, /后续修改/);
});

test("保存期间改回旧配置，即使轮询先返回新版本，也保留撤回修改的意图", () => {
  const initial = config();
  const submitted = { ...initial, title: "已提交" };
  const saved = { ...submitted, revision: 2 };
  const pending = { ...createDraftState(initial), pendingSave: true };
  const polled = receiveRemote(pending, saved);
  assert.equal(polled.draft.title, initial.title);
  const done = acceptSavedDraft(polled, submitted, saved, "Hub 已保存");
  assert.equal(done.draft.title, initial.title);
  assert.equal(done.base.title, submitted.title);
  assert.equal(isDraftDirty(done), true);
});

test("本次保存回执不会清除第三方更新产生的新冲突", () => {
  const initial = config();
  const submitted = { ...initial, title: "已提交" };
  const newer = { ...initial, revision: 3, title: "远端更新" };
  const pending = { ...createDraftState(initial), draft: submitted, pendingSave: true, conflict: newer };
  const done = acceptSavedDraft(pending, submitted, { ...submitted, revision: 2 }, "Hub 已保存");
  assert.equal(done.conflict?.revision, 3);
  assert.match(done.status, /处理冲突/);
});

test("迟到的保存响应不能使基准版本倒退", () => {
  const initial = config();
  const newer = { ...initial, revision: 3 };
  const current = { ...createDraftState(newer), pendingSave: true };
  const done = acceptSavedDraft(current, initial, { ...initial, revision: 2 }, "Hub 已保存");
  assert.equal(done.base.revision, 3);
  assert.equal(done.pendingSave, false);
});

test("放弃草稿优先恢复已获知的最新远端版本", () => {
  const initial = config();
  const newer = { ...initial, revision: 3, title: "最新配置" };
  const current = { ...createDraftState(initial), draft: { ...initial, title: "草稿" }, conflict: newer };
  const done = discardDraft(current);
  assert.equal(done.draft.title, "最新配置");
  assert.equal(done.base.revision, 3);
  assert.equal(done.conflict, null);
  assert.equal(isDraftDirty(done), false);
});
