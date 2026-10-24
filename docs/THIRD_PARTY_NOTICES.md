# 第三方与原创资产说明

| 内容 | 许可／来源 | 仓库处理 |
| --- | --- | --- |
| 项目代码、程序化模型、SVG、几何视频 | 本项目贡献者，MIT | LICENSE；原创源与生成脚本保留 |
| Noto Sans SC 派生字库 | SIL Open Font License 1.1 | `apps/web/src/assets/OFL-NotoSansSC.txt`、`firmware/main/ui/fonts/OFL-NotoSansSC.txt`；派生字库名称和范围见源码 |
| React／React DOM、Three.js、Vite、Fastify 等 | 各自 npm 包声明的许可 | 锁文件固定解析版本，依赖保留原始许可 |
| LVGL | MIT，组件管理器来源 | 不复制整份依赖源码，保留组件声明 |
| ESP-IDF／Espressif WebSocket 组件 | 各自发行版许可 | 使用声明依赖与已安装工具链 |
| resvg-js | 包内许可及其依赖声明 | 仅开发期 SVG 渲染，不打包到浏览器运行时 |
| FFmpeg | 用户本地安装版本及其编译配置决定 | 不分发 FFmpeg 二进制；仅用于可选媒体生成 |
| 游戏截图、原作视频、商品图和研究拼贴 | 原作及对应发布者 | 仅记录研究方法与来源类型，不随首版分发 |

本项目不是官方游戏客户端或官方周边。字体、第三方依赖和用户导入资源不因置于本项目中而自动转为 MIT。

默认媒体来源见 `apps/web/public/art/original/sources.json`。完整软件供应链以锁文件、固件组件声明及所下载包内的 LICENSE 为准。
