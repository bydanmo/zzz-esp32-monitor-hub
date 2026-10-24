# 工具分类

所有命令从仓库根目录执行。

| 分类 | 内容 | 入口 |
| --- | --- | --- |
| Windows 日常使用 | 启动、停止、开机自启 | [windows/](windows/) |
| ESP32 开发 | 构建／烧录、字体、LVGL 离屏检查 | [firmware/](firmware/)；见 [固件指南](../firmware/README.md) |
| 媒体制作 | 原创图形、自备素材转换、可选资源打包 | [media/](media/)；见 [媒体指南](../docs/media.md) |
| 共用 UI 规格 | 生成或检查网页／固件参数 | `npm run generate:ui`／`npm run check:ui` |

首次安装双击根目录 `setup.cmd`。之后可使用 `windows/start-monitor.cmd`、`windows/stop-monitor.cmd`，或根目录执行 `npm start`、`npm run stop`。
开机自启由 `windows/install-autostart.cmd` 安装，`windows/uninstall-autostart.cmd` 取消；未启用时不创建系统设置。
