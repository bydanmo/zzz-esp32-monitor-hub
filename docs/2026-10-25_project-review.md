# 项目审查与稳定性修复记录（2026-10-25）

## 范围与结论

本轮审查覆盖公开仓库 `main` 的 Hub、Web、ESP32 固件，以及本机实际运行的开发目录。开始时公开仓库本地 `main` 与 GitHub 默认分支均为 `343b525e70313434ed3ec06a22c9f122b09b0deb`。修复保存在本地 `codex/project-review-20261025` 分支，并同步到正在使用的开发目录；尚未合并到公开 `main`。

核心功能已具备：本机指标采集、网页配置草稿与显式应用、设备身份和配置 ACK、三页触控显示、TF 视频循环。审查确认的主要稳定性问题集中在“数据新鲜度”和“连接或请求乱序后的状态”。Hub、Web 与固件修复均已在本机部署；固件应用区读回哈希匹配，Hub 再次重启后设备仍对同一配置 r35 返回应用确认。用户已确认实体画面、触控、完整视频周期与播放中触摸返回数据页。

Hub 默认仅监听本机。局域网模式没有登录鉴权，应继续遵守 [安全边界](../.github/SECURITY.md)，仅在可信局域网开放。

## 证据

| 编号 | 观察与复现方式 | 结果 |
| --- | --- | --- |
| E-01 | GitHub 仓库默认分支 API 与本地 `git rev-parse main` | 审查基线同为 `343b525e`；公开资源包 `resources-v0.1.0` 已发布。 |
| E-02 | 审查基线的 `apps/hub/src/provider-manager.ts` 与旧版 Provider 状态测试 | 采集失败时旧数值仍标记 `available`；不遵守取消信号的采集器超时后会重入。 |
| E-03 | 运行 `npm test && npm run check && npm run build` | 公开仓库 66 项测试通过，Hub/Web 类型检查及生产构建通过。生产构建仍提示 3D 延迟模块超过 500 kB。 |
| E-04 | 运行 `node tools/testing/check-hub.mjs` | 临时独立 Hub 的 20 个并发目标写入各自回执正确，最终查询与文件一致；非法 2 月 30 日被拒绝。脚本不读写实际用户数据。 |
| E-05 | 运行 `powershell -File tools/firmware/test-config-delivery.ps1 -Gcc <gcc路径>`；在 ESP-IDF 5.4.1 环境构建开发目录固件 | 9 个配置传递场景通过；固件应用镜像 1,371,952 字节，应用分区剩余 56%。 |
| E-06 | 已备份数据后重启实际 Hub，查询 `/api/health`、`/api/devices`、`/api/providers` | Hub、网页和数据源正常，1 台设备在线；旧固件重连后配置 `appliedRevision=null`。把相同配置重新下发为 r35 后设备确认应用，新旧文件除 revision 外完全一致。新固件烧录后又重启一次 Hub，设备对同一 r35 再次主动确认。 |
| E-07 | 串口重插后核对 USB 实例、读取芯片 MAC；读出完整 Flash；烧录并读回应用区 | COM11 确认为连接 Hub 的同一 ESP32-S3。烧录前保存 16 MB Flash，校验值记录在本机备份目录。烧录 1,371,952 字节应用后读回 SHA-256 与构建 BIN 完全一致。 |
| E-08 | 用户查看实体屏幕并实际点按 | 数据显示、四角点按和底部导航正常；完成约 10 分钟“数据→视频→数据”循环，并确认视频播放中触摸立即回数据页。 |
| E-09 | 检查设备状态时间戳与 ESP-IDF WebSocket 客户端的 ping 条件；重启修复版 Hub 后跨两轮读取 `/api/devices` | Hub 每 2 秒推送遥测，固件因此不会主动 ping；旧版 `lastSeenAt` 在无配置操作时停在连接时刻。新版收到实体设备的两次 pong，时间戳分别更新到 15:28:26 和 15:28:56（北京时间），设备保持在线且 r35 已应用。 |

## 发现与修复

| 编号 | 优先级 | 触发与影响 | 修复及验证 | 状态 |
| --- | --- | --- | --- | --- |
| F-01 | 高 | Hub 重连后设备没有重发已经应用的 revision ACK；开机默认 r1 还会使首次真实 r1 被跳过。网页无法确认设备配置。证据 E-05、E-06。 | [固件状态机](../firmware/main/config_delivery.c)记录真实配置是否应用，并在每次连接按 `hello → ACK` 重发；9 个本机场景、全量编译、烧录读回，以及 Hub 重启后的同版 ACK 均通过。 | 重连确认实机通过；首次真实 r1 仍待专门实机触发 |
| F-02 | 高 | Provider 失败后旧 CPU/内存值继续作为新读数推送；超时但未结束的采集任务会重复运行。证据 E-02、E-03。 | [Provider 管理器](../apps/hub/src/provider-manager.ts)将历史值标记不可用，等待真实采集任务结束才释放运行位；[设备投影](../apps/hub/src/device-telemetry.ts)对不可用指标发送 `null`。新增失败恢复及超时重入测试。 | 已部署到本机 Hub |
| F-03 | 中 | 并发考试目标写入共用同一个临时文件，可能互相覆盖；无效日历日期会被 JavaScript 自动顺延。证据 E-04。 | [目标接口](../apps/hub/src/index.ts)串行化保存、状态更新和广播；[日期校验](../apps/hub/src/exam-target.ts)检查各月天数和闰年。隔离 Hub 并发测试通过。 | 已部署到本机 Hub |
| F-04 | 中 | 迟到的旧配置轮询会降低已知 revision，或把较新的冲突替换为旧冲突。证据 E-03。 | [草稿状态](../apps/web/src/state/draft-store.ts)拒绝低于已知最高 revision 的响应，补乱序回归测试。 | 已构建并由本机 Hub 提供 |
| F-05 | 中 | 首次任一元数据请求失败会丢掉其他成功结果，考试目标可能一直显示“等待加载”；目标保存回执还会覆盖保存期间新输入。证据 E-03。 | [元数据读取](../apps/web/src/services/hub-metadata.ts)独立接受各资源并每轮重试；[目标草稿](../apps/web/src/state/exam-target.ts)保留编辑中的输入。新增失败恢复和延迟回执测试。 | 已构建并由本机 Hub 提供 |
| F-06 | 中 | 连续下行遥测抑制固件主动 ping，Hub 又没有主动探测，导致 `lastSeenAt` 过期且半开连接可能长期占位。证据 E-09。 | [设备心跳](../apps/hub/src/device-heartbeat.ts)每 30 秒 ping，下一轮仍无 pong 时终止连接；仅收到 pong 才更新最近在线时间，配置下发不再伪造在线时间。新增超时与回执测试。 | 两轮实机 pong 通过；长时间观察仍待完成 |

数据到设备的关键路径为：

```mermaid
flowchart LR
  P[Provider 采集] --> M[Hub 指标状态]
  M -->|可用数值或 null| D[ESP32 遥测]
  W[网页草稿] -->|保存配置| H[Hub 持久化]
  H -->|配置 revision| D
  D -->|hello 再发送 applied ACK| H
  H -->|设备确认状态| W
```

其中 F-02 对应 `P → M → D`，F-01 对应 `D → H → W`。Hub 保存成功、WebSocket 发送成功和设备实际应用是三个不同事实；界面继续分别显示。

## 剩余验收与开发顺序

1. **持续运行。** 完整视频周期与视频中触摸返回已由用户确认。本机已启动 [只读观察脚本](../tools/testing/observe-hub.ps1)，每分钟将 Hub 可用性、设备连接数、已应用 revision、心跳间隔和 Provider 状态写入开发目录 `.runtime/stability-20261025.jsonl`，24 小时后自动退出。观察文件只能证明后端状态，页面状态与屏幕显示仍需实际查看。
2. **后续功能。** 场景顺序与停留时间已有编辑能力，固件自动轮换仍未启用；以上验收稳定后再开发。

本轮没有把 24 小时稳定性标为完成。回滚时，公开仓库可回到基线提交 `343b525e`；开发目录的原文件、r34/r35 配置及实际数据备份在 `.runtime/backups/project-review-20261025/`，旧固件 BIN/ELF 和完整设备 Flash 在其中的 `firmware-artifacts/`。Flash 备份包含设备私有数据，仅保存在被 Git 忽略的本机目录。
