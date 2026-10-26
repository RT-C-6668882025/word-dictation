# 生态协议

WordTok Skill 生态只有四种角色：一个 Router、三个专业 Skill、一个执行底座（App + MCP）。所有跨 Skill 交流只走本文定义的信封，不靠自然语言口头转述。

## 1. 能力注册表

| Skill | 负责 | 消费 `handoff` 键 | 产出 `handoff` 键 | 禁止 |
| --- | --- | --- | --- | --- |
| `wordtok`（Router） | 识别任务、选择下一步、合并信封、对用户说话 | 全部 | `next` | 不写 `resource`/`plan`/`execution`，不做专业判断 |
| `wordtok-source` | 找到或构造真实内容，评估质量，归一化为 `pages` | — | `resource` | 不配学习策略，不直接写库（交给 ops） |
| `wordtok-strategy` | 把目标翻译成白名单范围、排序规则、揭示方式 | `resource`（可选） | `plan` | 不改词库内容，不臆造 App 没有的能力（无 SRS） |
| `wordtok-ops` | 调用 MCP，保证幂等、分批、回读验证、可回滚 | `resource`/`plan` | `execution` | 不替用户决定学什么，不虚构 ID，不做未授权删除 |

新能力以同名 `wordtok-<职责>` 加入，必须满足第 5 节。

## 2. 信封

专业 Skill 每次结束时输出一个 JSON 代码块，`producer` 标明自己，只写自己的键：

```json
{
  "task_id": "wt-20261027-cet4",
  "producer": "wordtok-source",
  "status": "ok",
  "goal": "准备四级，三个月内过线，每天 30 分钟",
  "handoff": {
    "resource": {
      "name": "CET4 核心词 2607",
      "origin": "qwerty-learner/CET4_T.json",
      "license": "GPL-3.0（数据随仓库）",
      "count": 2607,
      "fields": ["word", "trans", "phonetic"],
      "missing": ["例句", "搭配"],
      "quality": "音标与中文释义齐全；无例句，需由 Agent 补或留空",
      "payload_ref": "<workspace>/wordtok/plans/cet4-batch-1.json"
    },
    "plan": {
      "scope": "全部 2607 词进白名单",
      "algorithm": {"kind": "none"},
      "reveal": "词形先显，释义与例句隐藏",
      "session": "按原序，每屏 6–8 条，不设总量上限",
      "rationale": "首轮只建立熟悉度，不筛词；错误统计为空时任何 errors 过滤都会把队列清空"
    },
    "execution": {
      "book_id": "bk_...",
      "operation_ids": ["wt-20261027-compose-1"],
      "verified": true,
      "readback": {"count": 2607, "pages": 66, "whitelist": 2607},
      "backup": "<workspace>/wordtok/backups/bk_...-20261027.json"
    }
  },
  "facts": [
    {"claim": "CET4_T 共 2607 条", "evidence": "get_words 返回 count=2607"},
    {"claim": "白名单已覆盖全部条目", "evidence": "get_learning_context whitelistIds=2607"}
  ],
  "questions": [],
  "next": null
}
```

规则：

- `status`：`ok` 可继续；`needs_input` 必须带 `questions`（≤2 个，且每个都改变执行结果）；`failed` 必须带 `facts` 里的错误证据。
- `facts` 只放**读回或可核对**的事实，格式 `claim` + `evidence`。不许写"应该已成功"。
- `next` 只由 Router 填写。专业 Skill 不指定下一站，也不在结尾推销别的 Skill。
- `payload_ref` 指向真实文件（`<workspace>/wordtok/...`），不要塞进对话让下一个 Skill 重新抄一遍。
- `<workspace>` 在本机（Minis）上是 `/var/minis/workspace`；换宿主时用该 Agent 的工作目录，不要写死。

## 3. 交接顺序

```
wordtok ──(resource 缺失)──> wordtok-source ──┐
   │                                          │
   ├──(plan 缺失)──────────> wordtok-strategy ┘
   │                                          │
   └──(已有 resource+plan 或单次操作)──> wordtok-ops ──> 用户可用的结果
```

一次只调一个专业 Skill。Router 拿到信封后重新判断，不预设"source→strategy→ops"长链：用户只是要改名，就直接 ops；已经有词库只要策略，就只 strategy。

## 4. 状态在哪

- 词库与白名单的**唯一真源**是 App（通过 MCP 读回）。Skill 本地不维护影子状态。
- 需要跨轮保留的中间产物（批次 payload、备份、信封快照）写在 `<workspace>/wordtok/<task_id>/`。
- 对话里只传 `payload_ref` 和关键数字。

## 5. 新增一个专业 Skill 的条件

1. 有独立职责，且现有三个 Skill 都不该承担（否则合并，不新增）。
2. 在本文注册表登记：消费键、产出键、禁止项。
3. 能独立验证：产出里必须有可读回的 `facts`。
4. 不直接写 App：所有落库操作仍由 `wordtok-ops` 执行。例外只有纯读。
5. 不复制 `mcp-contract.md`，一律引用 `wordtok/references/mcp-contract.md`（相对 skills 根目录）。

## 6. 用户可见语言

- 用户不需要知道 Skill 名称、信封、`operation_id`。对用户只说：找到了什么、准备怎么练、已经生效多少条、下一步他会看到什么。
- 失败说人话：「手机 App 现在是关的，打开后我用原编号重试，不会重复建库。」
- 不承诺 App 没有的能力（间隔重复、每日配额、云端同步、多设备）。
