# 当前交接

本页是接手入口，更新于2026-10-27。主版本入口为 `main`；维护者已明确授权将本轮0.4.0通过 [PR #1](https://github.com/bydanmo/zzz-esp32-monitor-hub/pull/1) 合并，最终合并结果以该PR和远端为准。合并前的main已固定为标签 `main-before-v0.4.0-20261027`，旧源码和原有提交历史均保留。新旧版本入口及用法见 [版本与历史](versions.md)。

## 当前实现

| 领域 | 已实现 | 入口 |
| --- | --- | --- |
| 固件0.4.0 | 四项导航、本地PWM亮度10%–100%、简化动效、屏保开关、独立NVS记忆与保存失败重试 | [固件指南](../firmware/README.md)；`firmware/main/device_settings*.c` |
| 设备交互 | 监控卡片内部完整描边；学习被动容器与按钮分离；设置滑条不误切页，新会话不抢设置页 | `firmware/main/ui/ui_shell.c` |
| 学习联动 | 只读投影、分页、开始／暂停／继续／结束、确认完成、配对授权与电脑回执；不推断实际分钟 | [接口与配对](study-link.md)；`apps/hub/src/study-*.ts` |
| 媒体 | cover铺满、可选源区域拼接；原创场景时钟外壳与固件UTC+8点阵时钟 | [媒体指南](media.md)；`tools/media/`、`firmware/main/crt_clock.c` |
| 公开源码治理 | 保留`apps/`／`tools/`分类、原创资源与只读演示；新增敏感路径／凭据／链接检查，配对材料默认忽略 | [Agent约定](../AGENTS.md)；`tools/testing/audit-public.py` |

本轮迁移还修复了干净检出时学习设置目录不存在导致本地PUT失败的问题：写入前创建数据目录，并串行保存。`tools/testing/check-study-bootstrap.mjs`在独立构建副本中验证，不读写真正的应用数据目录。

## 验证边界与剩余工作

- 维护设备运行同一硬件／界面代码，已确认点击、高亮和实际亮度变化正常。其机器配置、设备标识、真实学习内容与实拍照片不在公开仓库。
- 本地设置的重启／断电保持通过了存储夹具回归，尚未单独得到实体断电验证；不要把实际调光确认扩展成该项也通过。
- 本轮设备媒体有约30FPS的采样记录，但公开原创片段是另外生成的资源，没有单独物理摄屏确认；数据／播放完整5+5分钟的新一轮无人操作验收仍待复验。
- 不包含新的24小时稳定性结论。旧审查记录保留在 [项目审查](2026-10-25_project-review.md)，其版本与证据有时间边界。
- 本轮公开源码的本地验证见 [验证清单](validation-v0.4.json)，79项Node测试、170项LVGL检查和独立固件构建已通过；CI以PR当前提交的GitHub Actions结果为准。清单不预写远端结果。

## 接手与恢复

先看 `git status --short`、最近提交和PR状态。`npm ci`后执行 `npm run check`、`npm test`、`npm run build`、`python tools/testing/audit-public.py` 和 `node tools/testing/check-study-bootstrap.mjs`。固件检查按 [固件指南](../firmware/README.md) 运行；独立构建目录避免与其它工程共用。

复验屏保前先在小屏设置开启自动屏保、退出设置页并让电脑计时idle；用 `tools/testing/observe-device.py --port <实际端口> --seconds 660 --output .runtime/<新观察名>`，不要覆盖历史记录。实体保持验证记录重启前选定值、重启后加载值及本人观察，不用真实学习任务制造测试记录。

修改前保留可恢复的本地Git快照，按逻辑提交并更新本页。回退优先反向提交，不覆盖后续工作；实际刷机前另行确认硬件身份和应用区备份，仅写应用，不覆盖NVS或分区表。源码、私有运行设置、设备Flash备份和媒体导出分别管理。

公开源码使用项目原创媒体，不随仓库分发研究用原作素材。0.4.0帧与固件素材表须匹配，候选资源说明见 [媒体指南](media.md)。旧资源发布不覆盖，保留历史检出可复现性。
