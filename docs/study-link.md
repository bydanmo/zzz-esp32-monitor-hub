# 可选学习联动

设备可显示电脑服务的今日任务与计时，并在显式开启后控制同一电脑会话。该电脑服务是可选依赖，默认关闭；仓库不附带个人学习数据库或第三方桌面程序。没有该服务也能使用普通监控、倒计时和本地设置。

## 接入与启用

电脑服务在固定本机 `127.0.0.1:8000` 提供接口；Hub读取 `GET /api/device/study`。返回值为 `protocol:2`、`date`、`tasks:[{id,title,done,minutes}]`、`completed/total`、`session`。会话包含 `session_id`、`revision`、`status:idle|running|paused|ready`、`phase:focus|break`、`mode:pomodoro|stopwatch`、`elapsed_seconds`、`remaining_seconds`、`task:{title}|null`。服务必须自行负责真正的任务、计时、持久化和冲突处理。

只读联动可在 `.env` 设置 `STUDY_BRIDGE_ENABLED=1`，或从本机调用 `PUT /api/study-link`，body为 `{"enabled":true}`。最后一次本地开关保存在忽略的 `apps/hub/data/study-controls.json`，重启后优先读取该设置。`GET /api/study-link`查看可用性和设备回执；这些接口只接受loopback来源。

启用设备写操作前，在仓库根目录执行：

```powershell
python tools/firmware/pair-study-control.py
```

它为本地Hub和固件构建创建同一随机配对材料，保存在忽略的 `apps/hub/data/study-controls.json` 与 `firmware/main/study_pairing.h`，不会打印密钥。随后重建、重启Hub并重新烧录固件；再从本机 `PUT /api/study-link`，body为 `{"enabled":true,"controlsEnabled":true}`。缺少配对时设备仍可只读，旧固件兼容原显示协议。

## 设备动作

学习页支持选择当前页任务开始25分钟、暂停、继续、结束，以及点击方框后弹窗确认完成。状态由电脑回传后确认；等待中锁定重复写入，离线禁用，超时显示结果待核。完成任务不会自动结束计时，也不会猜测实际分钟、掌握度或覆盖独立日志。

显示协议为 `study-v1`，写控制额外声明 `study-control-v1` 并携带私有配对值。每个UTF-8消息严格小于512字节，任务每页3行，整批收齐再提交。新头的 `controls` 决定是否允许控制。

写入消息为 `{type:"studyAction",version:1,id,batch,action,taskId}`，action取 `start|pause|resume|end|done`。Hub只接受发给该连接的五秒内批次和可见任务，重新读取电脑状态并校验日期、会话revision和操作状态。最近128个请求ID合并在途／重复响应；断线不自动重放旧动作。

- 计时转发到电脑 `POST /api/focus/action`，传入 `request_id`、`revision`、`action`；start另传 `task_id`、`mode:"pomodoro"`、`phase:"focus"`、`duration_seconds:1500`。电脑须持久化幂等请求ID并拒绝过期revision。
- 完成转发到 `POST /api/tasks/<id>/done`，空body，语义为绝对完成而不是翻转。电脑负责不推断预计分钟、不覆盖独立日志。
- 回执为 `{type:"studyActionResult",id,status:"ok|conflict|error|unknown"}`；不确定请求是否已执行时保留unknown，不伪装失败或成功。

配对仅用于现有可信局域网部署；WebSocket沿用原传输方式，不是面向互联网的身份系统。

## 验证边界

`npm test`包含显示批次、过期、回执、配对、控制状态冲突、重复请求与失败回归。可选的 `tools/testing/verify-study-controls.py --study-root <兼容桌面服务源码目录>` 仅适用于相同SQLite／HTTP合同的服务，在备份副本与独立18031端口测试，默认结果放 `.runtime/`。不对正式任务做写入演示。

设备接收ACK不证明LCD像素；实体点击、亮度变化、重启保持和完整屏保周期的状态见 [当前交接](STATUS.md)。
