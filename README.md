# zzz ESP32 Monitor Hub

一个本地优先的 ESP32-S3 桌面监控系统：**固件＋本地 Hub＋网页控制台**，以复古电器、街头印刷和《绝区零》启发的原创界面为特色。

**没有硬件也能使用。** 先在电脑启动 Hub 与网页，查看本机真实数据；需要体验完整画面时进入明确标注的只读演示模式。

> 非官方爱好者项目，与《绝区零》及其权利方无隶属关系。仓库默认封面、终端模型和播放示例为项目原创图形，不包含游戏截图、角色贴图或原作视频。

![演示模式界面](docs/images/overview-demo.png)

## 先在电脑运行

首版以 **Windows** 为主要验证平台，其他操作系统尚未验证。

1. 安装 Node.js **22.21 或以上**（支持 22／24 系列），从仓库下载 ZIP 并解压，或使用 Git 克隆。
2. 第一次双击 `setup.cmd`：安装锁定依赖、构建、启动并打开网页。
3. 以后双击 `start-monitor.cmd`；停止用 `stop-monitor.cmd`。

也可在仓库根目录运行：

```powershell
npm ci
npm run build
npm start
```

打开 <http://127.0.0.1:8787/>。默认是真实主机数据；点击“体验只读演示”，或访问 <http://127.0.0.1:8787/?mode=demo>。

演示不打开实时 WebSocket，不访问真实数据 API，不写入真实考试目标或设备配置；草稿与外观偏好独立存储。演示始终标注示例，设备数量保持 0。

## 可以做什么

- 监控本机 CPU、内存、运行状态，以及数据源支持的 GPU、磁盘、网络和温度；不支持的指标显示原因。
- 六套主题、三种机壳、动态大字背景、暂停与简化动效。
- 原创 3D CRT／录像机终端，滚动改变视角，支持平面回退和 GLB 导出。
- 编辑 480×320 屏幕配置、场景排序、停留时间与指标显隐；区分草稿、发送与设备已应用。
- 设置可选考试倒计时；未设置时显示未提供，不硬编码个人日期。
- ESP32 上的总览／系统／学习页、触摸切换、真实采样趋势、局部纹样动画与 CRT 屏保。
- 原创示例媒体，以及自备图片／视频的本地转换流程。

### 当前边界

传感器可用性取决于操作系统和硬件。外部传感器服务、ESP32 与 TF 卡均为可选；没有它们也能使用网页。程序化终端是可编辑概念模型，不能直接用于制造外壳。默认没有 UI 音效。

## 配置与连接硬件

可将 `.env.example` 复制为 `.env`，修改端口或采集参数。默认仅监听本机。

ESP32 需要通过局域网访问时，将 `HUB_HOST` 改为 `0.0.0.0`，按实际环境允许本机防火墙访问，并把 Hub 的局域网地址填入设备本地配置。Hub 当前没有登录鉴权，仅用于本机或可信局域网，请勿直接暴露到公网。

已验证板型为 LCDWiki ES3C40P：ESP32-S3、ST7796S SPI、FT6336U I²C，480×320 横屏。固件使用 ESP-IDF 5.4.1、LVGL 8.4.0。

- [固件、引脚、配置与构建](firmware/README.md)
- [自备素材与原创资源说明](docs/media.md)
- [使用与常见问题](docs/usage.md)
- [设计流程与视觉语法](docs/design/README.md)
- [来源与许可](THIRD_PARTY_NOTICES.md)

## 开发与检查

```powershell
npm run check
npm test
npm run build
```

开发网页时先构建一次，再分别启动 Hub 和 Vite。当前 Vite 预览主要用于静态界面开发；完整同源 API／WebSocket 体验使用 Hub 提供的生产网页。

| 目录 | 内容 |
| --- | --- |
| `firmware/` | ESP32 固件、引脚、字库和显示管线 |
| `hub/` | 本机遥测、Provider、配置与设备会话 |
| `web/` | 网页控制台、独立演示和 3D 终端 |
| `shared/` | UI 布局与参数合同 |
| `scripts/` | Windows 启停、构建、原创素材生成和检查 |
| `assets/models/` | 原创概念模型导出 |
| `docs/design/` | 可复用的设计流程、组件和资产生产规范 |

欢迎提交问题和改进建议，参见 [CONTRIBUTING](CONTRIBUTING.md)。问题报告请移除 Wi-Fi 密码、个人路径、目标日期和日志中的私密信息。

## License

本项目代码与原创图形采用 [MIT](LICENSE)。Noto 派生字体分别按 OFL 许可分发，第三方依赖保留其各自许可，详见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)。

## English overview

**zzz ESP32 Monitor Hub** is a local-first desktop monitor with ESP32-S3 firmware, a local telemetry Hub, and a web console. Its original retro CRT / street-print interface is inspired by Zenless Zone Zero; this is an unofficial fan project.

No hardware is required to get started: install Node.js 22.21+, run `npm ci`, `npm run build`, then `npm start`. Visit `http://127.0.0.1:8787/` for real host metrics, or `/?mode=demo` for an explicitly labelled, read-only demo. Windows is the primary tested platform. Game artwork and videos are not bundled. Code and original graphics are MIT; font and dependency licenses are listed separately.
