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

三页包含大数字倒计时、CPU／内存仪表、24 点采样趋势、卡匣和导航。点击在线点查看连接详情，长按切换本次开机的简化动效。横向滑动切页，纵向拖动不误触切页。

长时间无触摸时，监控和屏保按 5+5 分钟循环；触摸返回监控。TF 需 MBR＋FAT32。缺卡、资源未就绪或播放失败时保留监控。默认源码不包含设备动画帧；下载可选资源或自行生成后启用屏保，步骤见 [素材说明](../docs/media.md)。

历史原型在相同板型、40MHz SPI 和 PSRAM 局部窗口上测得约 30 FPS。该结果限定于当时的设备与资源；本仓库新生成的默认原创片段没有单独物理摄屏验收，不承诺任意全屏素材同样帧率。

普通固件构建使用已提交字库，无需安装字体工具。重新生成需 Python/fontTools、本地 lv_font_conv 和合适的 Noto 字体文件；见 `tools/firmware/generate-firmware-font.ps1` 的参数。字库许可在 `main/ui/fonts/`。

## 离屏检查

在组件已下载且安装原生 GCC 后，可执行：

```powershell
powershell -ExecutionPolicy Bypass -File tools/firmware/render-device-review.ps1 -Gcc C:/msys64/ucrt64/bin/gcc.exe
```

这使用真实 LVGL 与测试遥测，不是硬件摄屏。渲染输出到本地 `.runtime/reviews/compact-layout/`；不应以主机刷新像素计数代替实机 FPS。
