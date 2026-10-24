# 原创媒体与自备导入

默认六张封面、终端场景和几何信号视频由本项目代码生成，无角色、原作商标、游戏截图、音乐或原作视频。SVG 源与媒体位于 `web/public/art/original/`，生成入口是 `scripts/create-original-art.py`，来源表在同目录 `sources.json`。

## 直接使用

网页构建直接复制已生成的原创媒体，不需要 FFmpeg 或 Python。设备资源在 `web/public/motion-assets/`，从 Hub 下载到 TF 并校验，再载入 PSRAM。

固定画布为 480×320；动态窗口为 198×150、x145/y82，16:9 内容在窗口内保留比例。静态背景单次绘制，后续只传窗口。源时间轴 30 FPS、4 秒、120 帧，资源合计约 7.44 MB；这不是任意硬件上的帧率承诺。

## 重新生成原创资源

安装 Python 3 和 FFmpeg（加入 PATH）后，从仓库根目录运行：

```powershell
python scripts/create-original-art.py
python scripts/create-original-art.py --media
npm run build
```

第一条仅生成 SVG。第二条用已安装的 Node 开发依赖渲染 SVG，并通过 FFmpeg 生成视频、RGB565、清单和固件素材表。FFmpeg 的版本、字体与编码器可能影响逐字节输出，重新生成后需要一并提交匹配的清单与固件表。

## 使用自己的图片和视频

```powershell
python scripts/prepare-crt-assets.py path/to/background.png path/to/video.mp4 --start 0 --duration 4
npm run build
```

该流程是命令行导入，不是网页文件上传。背景需按模板的电视位置设计；脚本不会自动识别任意图片中的屏幕。如换屏幕位置，必须同时调整窗口、遮罩和内容坐标，再验证设备边界。

转换后还需重新构建固件，使尺寸、长度与 CRC 表匹配；不得只替换视频文件。自备文件原件不复制进仓库，派生资源仍可能包含其内容；公开前检查 Git 变更，确保有权分发。

## 设计研究来源

视觉研究包括用户提供的游戏功能界面、宣传图、器物产品图，以及《2024绝区零 Creamfields音乐节 动态影像合集》。这些用于研究构图、印刷、材质和局部动画，原件、裁切拼贴和派生原作视频未随公开首版分发。

公开设计文档保留方法、参考编号与观察边界。完整本地研究目录中的私人绝对路径未进入公开源码。作品名和原作权利仍属于各权利方，不能将本项目 MIT 扩展为对第三方素材的许可。
