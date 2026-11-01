# 当前交接

更新于2026-11-01。本次更新为固件0.5.8与配套Hub／网页，维护者明确要求上传GitHub并要求每次更新和上传留痕。主入口为main，实际分支／PR／CI状态以[GitHub](https://github.com/bydanmo/zzz-esp32-monitor-hub)为准。完整变化、验证、逐文件哈希及恢复入口见[0.5.8更新记录](updates/v0.5.8.md)。

## 当前实现

| 领域 | 已实现 | 入口 |
| --- | --- | --- |
| 显示0.5.8 | 双DMA缓冲与直接传输、完整页动效、可选同页基准 | [固件指南](../firmware/README.md) |
| 动画库 | 网页上传／预览／排序／删除，设备固定单段或每次屏保推进一项，后台TF缓存，保存留页 | [媒体指南](media.md)；`apps/hub/src/animation-*.ts` |
| 专注计时 | 开始前1–120分钟，大字计时，暂停／继续／结束 | [学习联动](study-link.md) |
| Windows采集 | 原生接口／NVML，保留真实数据、缺失状态及2秒更新 | `apps/hub/src/providers/windows-native-source.ts` |
| 公开源码 | 原创默认素材、只读演示隔离、源码／可选资源分开、私有路径与链接检查 | [Agent约定](../AGENTS.md) |

## 当前验证边界

公开树的类型检查、89项Node、生产构建、隔离冷启动、236项LVGL及DMA数据一致性检查、目录解析、真实FFmpeg原创素材转换、独立ESP-IDF5.4.1构建已通过；见[验证清单](validation-v0.5.8.json)。远端CI以实际链接为准，不预写成功。

维护设备确认整页动效更快、颜色和触摸正常；同页双缓冲完整刷新中位耗时降低37.25%。这不是整屏30／50FPS承诺，公开原创媒体也未单独物理验收。新版CRT外观与返回、断电保持、新一轮无人操作5+5、24小时耐久仍待验。

## 下一步与恢复

接手先查Git工作树、最近提交、当前远端和本次PR。剩余实体检查为设置→动画→预览中的CRT画面／闹钟与返回，不能用host或CI代替。屏保规则已允许停留设置页，不必退出设置页来等候自动播放；学习暂停时保持暂停。

复现检查：`npm ci`、`npm run check`、`npm test`、`npm run build`、`python tools/testing/audit-public.py`、`node tools/testing/check-study-bootstrap.mjs`；固件与离屏命令见[固件指南](../firmware/README.md)。不要以真实任务制造测试记录。

旧main已固定为[main-before-v0.5.8-20261101](https://github.com/bydanmo/zzz-esp32-monitor-hub/tree/main-before-v0.5.8-20261101)。每次更新与上传记录恢复点、文件变更、检查、提交、目标分支和远端回执，撤销用反向提交。私人备份、配对／Wi-Fi配置、原作素材和固件二进制不上传。旧0.4.0记录见[版本入口](versions.md)。
