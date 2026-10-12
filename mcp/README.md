# AI 连接（远程 MCP）

用户只需要手机和一个支持远程 MCP（Streamable HTTP）的 Agent。无需电脑、USB 或本地 Python。手机关于页开启连接，把 MCP 地址添加到 Agent，即可查看词库、随机或按主题选词、修改白名单、导入资料和创建专题词库。保持 App 前台联网。地址含连接凭据，只交给自己信任的 Agent；关闭连接后地址立即失效。

六个工具：list_wordbooks、get_words、add_to_whitelist、remove_from_whitelist、import_wordbook、create_temp_wordbook。

白名单仍代表需要背的词。加入返回实际新增 changed_ids，撤销只移出这些 ID。如果词库的词原本全部在白名单，加入不会隔离出抽查的 30 个词；单独练习可创建临时词库。临时词库只是名称带 [临时] 的普通词库，正常保存并用原有按钮删除。PDF、图片、Word 转换由 Agent 完成，再传每行英文和中文的词表 text 给 App 原有解析器。

## 维护者部署

连接服务是 `relay.mjs`，Node.js 22+，无第三方依赖。执行 `npm start`，默认监听 PORT=8080。部署到长期运行的容器或 Node 服务，在 HTTPS 反向代理后提供公网地址；不适合普通短时无状态函数。设置 ALLOWED_ORIGINS 为允许的 App/Web 来源（默认含 Capacitor 本地来源和项目网页）。代理关闭访问日志中的敏感 URL 路径、开启 IP 限流，并设置请求超时大于 30 秒。生产实例需单进程或粘性路由；会话暂存在内存，实例重启需要重新开启连接。空闲会话 24 小时清理，最多 1000 个同时配对。

构建 App 时设置 `VITE_AI_RELAY_URL=https://你的服务域名`，用户无需填写地址。开发版本未设置时，在第一次开启连接时输入服务地址。

服务只中转本次工具参数与结果，不主动上传整个词库、不写磁盘。Agent 收到的词表由用户授权读取。没有支持 MCP 的工具调用能力的 Agent 无法直接使用此连接。

## 验证

`npm test` 验证远程 MCP 初始化、工具发现、手机轮询、结果返回、鉴权、来源拒绝、超时和关闭连接。根目录执行 `npx tsx scripts/check-ai.ts` 验证跨页白名单、撤销保留已有词、无效 ID 原子拒绝、分页和导入。

目前实现和协议测试已完成；正式公网服务及真实手机联调需部署后验证，不能把本地测试视为 APK 已可连任意云端 Agent。

## 腾讯云部署文件

`docker compose -f mcp/compose.yml up -d --build` 启动独立服务，端口只绑定服务器本地 `127.0.0.1:18766`。使用现有 HTTPS 代理添加站点，Caddy 示例见 `Caddyfile.example`；保留服务器已有站点配置。域名须先解析到服务器。

部署后在可访问公网的 Node 22+ 环境运行 `node mcp/smoke.mjs https://服务域名`，检查 HTTPS、初始化、六个工具、双向请求和关闭连接。此检查使用模拟手机，不读真实词库。真实手机需再验证读取、白名单和导入。

Android 构建支持手动输入 `ai_relay_url`，或读取 GitHub 仓库变量 `AI_RELAY_URL`；地址内置到 APK，使用者无需配置服务器。
