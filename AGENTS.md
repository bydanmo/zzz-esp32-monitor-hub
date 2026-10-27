# 开发与接手

使用简体中文。先读 [当前交接](docs/STATUS.md)，再按任务阅读 [开发指南](docs/development.md)、[固件说明](firmware/README.md) 或 [设计流程](docs/design/README.md)。历史验证不能代替当前现场。

- 实现位于 `apps/hub/`、`apps/web/`、`firmware/`；工具按 `tools/firmware/`、`tools/media/`、`tools/testing/`、`tools/windows/` 分类。
- 修改前查看 Git 状态，保留他人改动，保存可恢复的本地快照；每个逻辑改动用提交留痕，更新 `docs/STATUS.md` 的结果、剩余工作、证据与恢复方法。
- 源码仓库保持轻量。Wi-Fi 配置、配对密钥、实际用户数据、NVS／Flash备份、原作素材、构建和评审导出不提交；可分发原创导出放独立资源包。不要覆盖公开版原创素材和只读演示隔离。
- 库／SDK／API用法先通过 Context7 查询对应版本：先resolve，再按单一概念query。一般业务逻辑检查不必查询。
- `npm run check`、`npm test`、`npm run build` 为基本检查，发布前执行 `python tools/testing/audit-public.py`。固件／UI改动补相应原生检查与ESP-IDF构建；实体触摸、重启保持、屏保周期、审美与长期稳定分别记录。
- 学习控制只在本机显式开启并完成配对后启用。电脑是任务和计时的真源；预计分钟不自动记成实际投入。不使用真实学习任务制造测试记录。
- 保留未完成工作的审查状态；CI通过不自动代表实体全部验收或允许合并。PR／资源候选版与默认分支、正式发布分开说明。
