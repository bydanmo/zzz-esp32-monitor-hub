# 版本与历史

`main`是项目默认打开、后续继续维护的主版本。本轮交付为0.4.0：设备本地亮度与显示设置、学习控制、按压高亮、点阵时钟及配套原创媒体工具。维护者于2026-10-27明确授权通过PR #1合并；实际合并状态见[PR记录](https://github.com/bydanmo/zzz-esp32-monitor-hub/pull/1)。

| 入口 | 用途 |
| --- | --- |
| [当前主版本](https://github.com/bydanmo/zzz-esp32-monitor-hub/tree/main) | 日常查看和后续开发；会随新的合并继续更新 |
| [合并前的旧main](https://github.com/bydanmo/zzz-esp32-monitor-hub/tree/main-before-v0.4.0-20261027) | 固定标签，保留本轮合并前的完整源码，提交343b525 |
| [下载旧main源码ZIP](https://github.com/bydanmo/zzz-esp32-monitor-hub/archive/refs/tags/main-before-v0.4.0-20261027.zip) | 无需安装Git即可保存一份旧版源码 |
| [提交历史](https://github.com/bydanmo/zzz-esp32-monitor-hub/commits/main) | 查看每次修改、作者、说明及文件差异 |
| [0.4.0原创资源候选](https://github.com/bydanmo/zzz-esp32-monitor-hub/releases/tag/resources-v0.4.0) | 与新固件素材表匹配的可选大资源；仍保留候选验收边界 |
| [旧版原创资源](https://github.com/bydanmo/zzz-esp32-monitor-hub/releases/tag/resources-v0.1.0) | 与合并前旧版源码配套；不会被新资源覆盖 |

合并会把新提交纳入main，不会删除旧提交。本轮使用保留分支提交的merge commit，旧main备份标签始终指向原来的提交；保留开发分支用于查看本轮过程。不要移动或覆盖这个备份标签。

要讨论旧版，可以直接说“查看合并前旧main，标签main-before-v0.4.0-20261027”，再指出界面、文件或功能。查看旧版只需打开标签页面；下载源码ZIP也不会改变正在使用的项目或实体设备。

确需从旧版继续开发时，先保证工作树干净，在单独目录或新分支从该标签开始；不要用强推覆盖main。确需撤销本次合并时，先核对实际合并提交及其第一父提交，再通过反向提交恢复，并保留后续历史。源码版本切换不等于实体固件已经回退，刷机仍需应用区备份和硬件复核。

合并授权不改变[当前交接](STATUS.md)记录的实机边界：断电保持、公开原创资源观感、完整新一轮屏保周期和长期观察仍分别验收。
