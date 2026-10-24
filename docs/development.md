# 源码与开发

从根目录运行 `npm ci` 安装锁定依赖。应用按 npm workspace 管理，共用根锁文件。

| 目录 | 职责 |
| --- | --- |
| `apps/hub/` | 本机数据采集、Provider、API、WebSocket、设备会话 |
| `apps/web/` | 网页、只读演示、实时预览与程序化 3D 终端 |
| `firmware/` | ESP32-S3 固件、显示、触摸、字库、资源同步 |
| `shared/` | 网页与固件共用的 UI 参数和布局 |
| `tools/` | Windows 启停、固件构建、媒体生成与检查 |
| `tests/` | 状态、数据、配置与演示隔离检查 |
| `docs/` | 使用、设计、验证与许可说明 |

```powershell
npm run check
npm test
npm run build
```

开发时先构建一次，再分别启动 Hub 与 Vite：

```powershell
npm run dev
npm run dev --workspace @esp32-monitor/web
```

Vite 用于界面开发；完整同源 API／WebSocket 体验使用 Hub 提供的生产网页。
Hub 通过根 `.env` 读取配置，本地数据在 `apps/hub/data/`，不进 Git。
从旧目录升级时先停止旧实例；如需保留个人配置，可把原 `hub/data/` 的配置自行复制到新位置，不要提交。

网页必需的封面、字体和小视频保留在 `apps/web/`。离线 GLB、RGB565 帧和评审导出放在独立资源包／`.runtime/`。
网页 3D 由 `apps/web/src/three/terminal-model.ts` 直接构造，不依赖下载 GLB；可在网页重新导出。
新资源公开前登记来源、许可和用途，参见 [媒体说明](media.md)。

## 获取精简源码

下载首页的源码 ZIP，或浅克隆当前版本：

```powershell
git clone --depth 1 https://github.com/bydanmo/zzz-esp32-monitor-hub.git
```

早期提交仍保留原目录和旧导出，完整 Git 历史没有被强制改写。主分支文件树和新的源码 ZIP 已拆分可选资源；浅克隆可避免同时下载早期资源历史。
