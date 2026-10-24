# 可选资源与自备导入

## 默认源码包含什么

六张 SVG 封面、原创 CRT 场景和网页短视频保留在 `apps/web/public/art/original/`，网页无需 Python 或 FFmpeg 即可运行。来源见同目录 `sources.json`。
ESP32 RGB565 动画帧、离线 GLB 和额外评审预览已移到独立资源包。它们不影响网页 3D、实时监控、主题和演示；设备缺少媒体时保留监控。

## 下载设备动画与离线模型

打开 [可选资源发布页](https://github.com/bydanmo/zzz-esp32-monitor-hub/releases/tag/resources-v0.1.0)，下载 `zzz-monitor-resources-v0.1.0.zip` 与校验文件。将 ZIP **解压到仓库根目录**，保留其中目录结构，再执行：

```powershell
npm run build
```

重启 Hub 后设备可从 `/motion-assets/` 下载资源到 TF，再校验并载入 PSRAM。包内固件素材表与帧文件需配套；版本不同或使用自备视频时重新构建固件。
`RESOURCE-PACK.json` 登记逐文件 SHA256；外层 ZIP 校验值见同名 `.sha256`。
帧、评审视频和 GLB 导出被 `.gitignore` 忽略；小型固件素材表仍随源码管理。不要用 `git add -f` 把导出塞回主仓库。

| 包内路径 | 用途 |
| --- | --- |
| `apps/web/public/motion-assets/` | 设备播放帧与背景 |
| `apps/web/public/motion-review/` | 预览视频与素材清单 |
| `.runtime/optional-resources/models/dm01/` | 原创终端离线 GLB 与模型说明 |
| `firmware/main/media_assets.generated.h` | 对应尺寸、长度与 CRC 表 |

GLB 是概念模型，不含实时 DOM 屏幕，不具备毫米尺寸、公差或制造验证。网页本身由程序化模型生成，离线导出不是运行依赖。

## 从源码生成

执行 `npm ci`，安装 Python 3 和 FFmpeg（加入 PATH），再运行：

```powershell
npm run media:generate
npm run build
```

生成器位于 `tools/media/create-original-art.py`。固定画布 480×320，动态窗口 198×150、x145/y82，源时间轴 30 FPS／4 秒／120 帧，帧数据约 7.44 MB；不代表任意设备实测帧率。
生成会同步更新固件素材表。FFmpeg 版本与字体可能改变逐字节输出，帧、清单和表必须配套。随后可用 `npm run resources:pack` 生成独立 ZIP；离线模型只在本地存在时加入，不会暗中下载。

## 使用自己的图片和视频

```powershell
python tools/media/prepare-crt-assets.py path/to/background.png path/to/video.mp4 --start 0 --duration 4
npm run build
```

这是命令行导入。背景中的电视需按模板匹配固定窗口，脚本不会识别任意屏幕位置。转换后重新构建固件，使尺寸、长度与 CRC 一致，不得只替换视频。
原文件不复制进仓库，但派生资源仍可能包含其内容；请确认有权分发再制作资源包。

## 研究来源

视觉研究包括游戏功能界面、宣传和器物产品图，以及《2024绝区零 Creamfields音乐节 动态影像合集》。这些原件、裁切拼贴和派生原作视频未随源码或原创资源包分发；公开设计文档保留方法、参考编号与观察边界。
项目 MIT 不扩大第三方原作许可，详见 [来源与许可](THIRD_PARTY_NOTICES.md)。
