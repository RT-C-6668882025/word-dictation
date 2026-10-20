# WordTok

**复制地址 解锁一切**

在 App「关于 → 连接 AI」复制 MCP 地址，添加到支持自定义远程 MCP（HTTP）的 Agent。连接后，让 Agent 整理资料、创建词库；打开 WordTok 上下刷着背。

[下载 Android APK](https://github.com/RT-C-6668882025/word-dictation/releases/latest/download/word-dictation.apk)

## 功能

- **刷着学**：像刷视频一样上下翻页，按手机或平板屏幕自动安排每页内容；不要求制定学习计划。
- **自由内容块**：单词、知识点、问答都能做成多个块；点块显示或隐藏，支持左右两侧批量显隐。
- **AI 编排**：Agent 可通过 18 个 MCP 工具创建和管理词库、页面、内容块、初始显隐、预设版式及白名单，也能检索全部内容用于问答和出题。
- **白名单与索引**：把还需要背的条目留在白名单；从索引查找并跳转。
- **朗读**：英文可用 KittenTTS，中文及中英混读可下载 MeloTTS；未下载模型时使用系统语音。
- **导入与保存**：支持粘贴文本及 TXT、CSV、TSV、Markdown、XLS、XLSX、DOC、DOCX、PDF、JSON；词库保存在本机。

## 支持的 Agent 客户端

这些客户端提供自定义远程 MCP 入口：

| 客户端 | 添加方式 |
| --- | --- |
| [豆包工作](https://cli.im/open-api/agent/open-platform-mcp/doubao-work.html) | 电脑版自定义连接器，选择 HTTP。 |
| [腾讯 WorkBuddy](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector) | 自定义连接器。 |
| [千问办公](https://help.aliyun.com/zh/qwenwork/desktop-connectors) | 桌面端连接器，选择 Streamable HTTP。 |
| [扣子](https://docs.coze.cn/mcp) | 网页／桌面端添加自定义 MCP，再绑定 Agent。 |
| [Cherry Studio](https://cherryai.com.cn/docs/zh-cn/mobile/plugins/) | 移动版自定义 MCP 服务器。 |

MCP 字段与操作说明见 [Agent 文档](mcp/README.md)；排版规则见 [Agent 排版规则](docs/agent-layout-guide.md)。
