# 固定配对与指令回执（服务 v2）

手机首次配对保存本机专用随机凭据及固定 MCP 地址，重启应用自动连接。服务端持久化配对及指令记录，重启服务后地址保留。网络断开自动重连，也可手动重连；仅解除配对才撤销地址。没有暂停功能。

手机显示未配对、正在连接、已就绪、AI 正在操作、重连中或配对已失效。已就绪表示手机刚收到服务响应，不表示 Agent 正在使用。

工具：list_wordbooks、get_words、add_to_whitelist、remove_from_whitelist、import_wordbook、create_temp_wordbook、get_operation_result。

写入建议传 operation_id。回执含 request_id、status、result 或 error、data_changed。只有 succeeded 表示保存确认；offline/busy/conflict 不执行新操作，running/pending/unknown 不能当成失败或成功。查询结果不重复执行。超时后先查询，重试使用同一 operation_id；同编号不同内容会被拒绝。终态结果保留 7 天，超过保留期不要盲目复用旧编号。

手机将词库与操作回执保存为单个 wd_state_v3 本地记录；导入及白名单操作重发时返回原结果。Android 原生备份保存成功后再返回 succeeded。若保存部分成功，错误会明确 data_changed=true，Agent 不应直接再发新编号。手动删除词库不会删除回执，避免迟到指令把删除的词库重新创建。

## 更新现有腾讯云服务

必须先部署服务 v2，再发布 0.4.31 APK。当前线上旧版服务的配对只在内存中，升级时旧地址可能失效；用户首次使用新版本需解除旧配对并重新配对一次。之后配对由持久化存储保留。

拉取包含本次修改的分支，保持现有 HTTPS 域名与代理配置。Docker：docker compose -f mcp/compose.yml up -d --build。新增 relay-data 数据卷，DATA_FILE=/data/relay.json。不要使用 down -v，否则会删除配对身份和结果。容器以 node 用户运行，数据目录需可写。

若现有服务使用 Node/systemd 而非 Docker：保持原服务管理方式，新增持久化 DATA_FILE 的绝对路径，位于服务用户专用目录；目录权限 700，数据文件权限 600。Node.js 22+。服务从默认 ./data/relay.json 保存，可通过 DATA_FILE 设置；不要放进公开网页目录或 git 仓库。数据文件包含凭据和工具结果，应受保护及备份。

支持的健康接口：https://实际地址/health 应返回 protocol=2、persistent=true。部署后运行 node mcp/smoke.mjs https://实际地址 验证公网 MCP、手机收发和解除配对。该检查使用模拟手机，不读真实用户词库。

先完成一次真实手机配对并复制地址，然后重开手机 App，确认地址相同；重启 relay 服务，确认同地址仍能调用；断网恢复后自动重连；验证导入、白名单、结果查询和超时重试。保留现有 Hermes 与其他站点。

## 部署方式

Node.js 22+ 长期单进程服务，HTTPS 代理到本地 127.0.0.1:18766。Docker/Caddy 示例见 compose.yml 和 Caddyfile.example。可配置 ALLOWED_ORIGINS。禁止日志记录含凭据的 MCP URL，代理请求超时大于 30 秒。

当前仍为单实例持久化实现，不支持多实例共享同一 JSON 文件。不要启动多个实例写同一 DATA_FILE。默认 1000 个配对，配对不再按 24 小时清理，解除配对释放容量。终态结果 7 天清理。

App 构建设置 VITE_AI_RELAY_URL；Android 工作流读取仓库变量 AI_RELAY_URL 或 ai_relay_url 输入，使用者无需填写服务器地址。系统凭据是 App 自己生成的配对身份，不读取手机已有钱包或其他 App 密钥。

验证：node --test mcp/relay.test.mjs；npx tsx scripts/check-ai.ts；node scripts/check-ai-ui.cjs（需先构建并准备 Playwright Chromium）。
