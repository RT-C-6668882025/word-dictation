# WordTok

**开源 不设学习计划 只背单词**

计划可能搁浅 没有计划也能靠内驱力完成目标 你可以靠自己 也可以靠你的 Agent 注意 是 Agent

WordTok 是一款 Android App，像刷视频一样背单词。词库保存在本机，可自行导入，也可交给 Agent 编排。

[下载 Android APK](https://github.com/RT-C-6668882025/word-dictation/releases/latest/download/word-dictation.apk)

仅提供 Android App，网页版与 PWA 已停止提供。

## 开始使用

1. 下载并安装 APK。
2. 导入词库或粘贴文本，即可开始学习。
3. 默认无算法，按自己的记忆与白名单练习。

## 连接 Agent

**复制 MCP 地址即可使用 Agent 编排功能**

在 App 的 **关于 → 连接 AI** 中复制专属 MCP 地址，发给支持远程 MCP 的 Agent，并说：**安装这个地址的 MCP**。

腾讯 WorkBuddy 手机 App 已实测可以按这句话直接安装。

把[项目仓库链接](https://github.com/RT-C-6668882025/word-dictation)发给 Agent，即可让它阅读项目说明。找词库、制定策略和写入 App 的分工见下方 Agent Skills 词库生态。

## 功能

- **刷着学** 像刷视频一样上下翻页 根据设备屏幕自动安排内容 无需学习计划
- **自由内容块** 单词 知识点 问答均可拆成多个块 点按切换显隐 支持左右批量显隐
- **AI 编排** 26 个 MCP 工具可创建 管理 检索词库 页面 内容块 白名单和初始显隐 Agent 可据此问答与出题
- **练习算法** 默认无算法 只按白名单练习 Agent 可通过 MCP 创建 预演和启用规则 每词库独立选择 配置跨词库复用 无算法编辑界面
- **白名单与索引** 保留需要继续背的内容 快速查找和跳转
- **朗读** 英文支持 KittenTTS 中文及中英混读支持 MeloTTS 未下载模型时使用系统语音
- **导入与保存** 支持粘贴文本 TXT CSV TSV Markdown XLS XLSX DOC DOCX PDF JSON 词库保存在本机

## Agent 客户端连接方式

| 客户端 | 连接方式 |
| --- | --- |
| [腾讯 WorkBuddy](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector) | 手机 App 已实测 发送 MCP 地址并说 安装这个地址的 MCP 即可安装 |
| [豆包工作](https://cli.im/open-api/agent/open-platform-mcp/doubao-work.html) | 电脑版添加自定义 HTTP 连接器 |
| [千问办公](https://help.aliyun.com/zh/qwenwork/desktop-connectors) | 桌面端添加 Streamable HTTP 连接器 |
| [扣子](https://docs.coze.cn/mcp) | 网页端或桌面端添加自定义 MCP 再绑定 Agent |
| [Cherry Studio](https://cherryai.com.cn/docs/zh-cn/mobile/plugins/) | 移动版添加自定义 MCP 服务器 |

[Agent 与 MCP 字段说明](mcp/README.md) [Agent 排版规则](docs/agent-layout-guide.md)

## Agent Skills 词库生态

`skills/` 下是四个职责独立的 Skill 把「找词库 定策略 写进 App」拆开 由 Agent 自动编排

| Skill | 职责 |
| --- | --- |
| `wordtok` | 路由 判断缺内容还是缺策略 选择下一步 核对事实 |
| `wordtok-source` | 找词库或解析用户文件 评估覆盖与字段 归一化为 pages 载荷 |
| `wordtok-strategy` | 把学习目标翻译成白名单范围 排序规则 揭示顺序 |
| `wordtok-ops` | 调用 MCP 幂等写入 分批 回读验证 破坏性操作前备份 |

安装 把 `skills/` 下四个目录复制到 Agent 的 skills 路径（如 `~/.agents/skills/`）即可 Minis 直接放到共享 skills 目录
Skill 之间用 `skills/wordtok/references/protocol.md` 定义的交接信封通信
26 个 MCP 工具的字段 状态机与 1 MiB / 500 卡 / 25 秒限制见 `skills/wordtok/references/mcp-contract.md`
