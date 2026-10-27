# ESP32-S3 固件

已验证硬件：LCDWiki ES3C40P，ESP32-S3、ST7796S SPI、FT6336U I²C。面板按 480×320 横屏使用。其他板型需核对 `main/board_config.h`，不能只改分辨率。

## 配置

1. 将 `main/wifi_config.example.h` 复制为 `main/wifi_config.h`。
2. 填入本地 2.4GHz Wi-Fi、密码与 Hub 地址，如 `ws://192.168.1.100:8787/device-ws`。示例地址应替换为你的电脑实际局域网地址。
3. Hub 的 `.env` 设置 `HUB_HOST=0.0.0.0`，设备与电脑接入同一可信局域网。

`wifi_config.h` 已被 Git 忽略，不要将其上传或附到问题报告中。

## 构建与烧录

使用 ESP-IDF **5.4.1** 的 PowerShell 环境。依赖由组件管理器安装：LVGL **8.4.0**、esp_websocket_client 1.4.0。

```powershell
powershell -ExecutionPolicy Bypass -File tools/firmware/build-firmware.ps1
powershell -ExecutionPolicy Bypass -File tools/firmware/build-firmware.ps1 -Flash -Port COM11
```

命令从仓库根目录执行。COM11 只是示例，按设备管理器中的实际端口替换。未存在 Wi-Fi 文件时脚本会复制示例，网络使用前仍需填写。

构建目录默认在临时目录的 ASCII 路径，禁用 ccache，并使用 UTF-8 Python。源码可以保留中文路径。可通过 `-BuildDir` 指定独立 ASCII 目录；也支持显式 `-IdfPath`、`-ToolsPath`、`-PythonPath`，不假定你的工具安装在某个盘符。不同工程请使用不同构建目录。

生成应用位于 `firmware/dist/`。应用、sdkconfig、依赖和 Wi-Fi 配置不进入源码仓库。

## 已验证引脚

| 功能 | GPIO |
| --- | --- |
| LCD CS / DC / SCLK | 10 / 46 / 12 |
| LCD MOSI / MISO / RESET / BL | 11 / 13 / 18 / 45 |
| 触控 SDA / SCL / INT | 16 / 15 / 17 |
| SD CLK / CMD | 38 / 40 |
| SD D0 / D1 / D2 / D3 | 39 / 41 / 48 / 47 |

## 画面和资源

固件0.4.0包含三个数据页和独立本地设置页。数据页含大数字倒计时、CPU／内存仪表、24点采样趋势、可选今日任务与计时。点击在线点查看连接详情，长按切换并保存简化动效。监控卡片按压描边在内部后绘制，避免父容器裁切。

## 本地设置

底部第四项「设置」提供亮度10%–100%滑条与加减、简化动效、自动屏保开关。拖动即时预览，松手保存，重复相同值不反复写Flash；失败时显示重试。设置使用独立NVS键，离线可用，网页配色与普通遥测不会覆盖它。

亮度由GPIO45的5kHz、10bit LEDC PWM控制，最低10%避免误关屏；播放触摸返回会恢复选定亮度。打开设置页期间不进入屏保，拖动滑条不切页，新专注会话不会抢走设置页。默认100%亮度、完整动效、屏保开启。

本地持久化使用NVS的 `local_display/options` 版本化单键，坏格式回退默认值；主任务栈6144字节。维护设备已确认亮度实际变化，重启／断电保持尚未单独实体确认，不能用host存储夹具代替此项。

## 可选学习控制

支持选任务开始25分钟、暂停、继续、结束和弹窗确认完成。默认只读，须本机显式开启控制并执行 `python tools/firmware/pair-study-control.py`，重建／重启Hub和重新烧录固件。私有 `study_pairing.h` 与Hub配对文件均被忽略。电脑服务合同、回执和隔离验证见 [学习联动](../docs/study-link.md)。

## 屏保与时钟

长时间无触摸时，监控和屏保按 5+5 分钟循环；触摸返回监控。TF 需 MBR＋FAT32。缺卡、资源未就绪或播放失败时保留监控。默认源码不包含设备动画帧；下载可选资源或自行生成后启用屏保，步骤见 [素材说明](../docs/media.md)。

历史原型在相同板型、40MHz SPI 和 PSRAM 局部窗口上测得约 30 FPS。该结果限定于当时的设备与资源；本仓库新生成的默认原创片段没有单独物理摄屏验收，不承诺任意全屏素材同样帧率。

普通固件构建使用已提交字库，无需安装字体工具。重新生成需 Python/fontTools、本地 lv_font_conv 和合适的 Noto 字体文件；见 `tools/firmware/generate-firmware-font.ps1` 的参数。字库许可在 `main/ui/fonts/`。

## 离屏检查

在组件已下载且安装原生 GCC 后，可执行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/firmware/render-device-review.ps1 -Gcc C:/msys64/ucrt64/bin/gcc.exe
```

这使用真实LVGL与测试遥测，不是硬件摄屏。渲染JSON默认在 `.runtime/device-review/`，原始BMP在 `.runtime/lvgl-host/raw/`，可用 `-Output` 指定目录。脚本还运行C时钟和本地设置存储检查；不应以主机刷新像素计数代替实机FPS。
