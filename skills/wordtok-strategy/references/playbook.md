# 策略手册

## 规则语法（只有这些）

```json
{"kind":"rules","rules":{
  "filter":{"all":[{"field":"errors","op":"gt","value":0}]},
  "sort":"errors_desc",
  "limit":100,
  "seed":42
}}
```

- `field` ∈ `errors` `correct` `lastPracticedAt` `order`
- `op` ∈ `eq` `ne` `gt` `gte` `lt` `lte`
- `filter` 支持 `{all:[…]}` `{any:[…]}` `{not:…}`，嵌套 ≤12 层、节点 ≤200
- `sort` ∈ `original` `random` `errors_desc` `oldest_first`
- `limit` 非负整数；`seed` 整数
- 只有 JSON，没有表达式、没有代码、没有自定义插件

`now` 由 App 取当前毫秒时间戳，规则里不能写"今天"。做「三天前练过」只能用固定阈值，做不到动态日期。

## 场景表

| 场景 | 判据 | profile | 说明 |
| --- | --- | --- | --- |
| 首轮熟悉 | 无事件、零基础、首考 | `{"id":"order-v1","name":"原序通刷","version":1,"algorithm":{"kind":"none"}}` | 不加算法；最稳 |
| 通刷但不设总量 | 有事件但不想筛 | `none` | 同上 |
| 错词优先 | 用户明确反馈过 ≥10 条 | `{"id":"errors-v1","name":"错词优先","version":1,"algorithm":{"kind":"rules","rules":{"filter":{"field":"errors","op":"gt","value":0},"sort":"errors_desc"}}}` | 队列 = 错过的词；没错词时为空 |
| 错两次以上（冲刺） | 有较多事件 | filter `{"all":[{"field":"errors","op":"gte","value":2}]}`，sort `errors_desc` | 更窄，先确认条数 |
| 生疏优先 | 想先过一遍没碰过的 | `{"id":"stale-v1",...,"rules":{"sort":"oldest_first"}}` | 没练过的 `lastPracticedAt=0`，排最前 |
| 随机抽查 | 自测、考前保持手感 | `{"id":"sample-v1",...,"rules":{"sort":"random","seed":20261101,"limit":100}}` | limit 是总量，不是每天 |
| 反向回忆 | 写作/翻译向 | 同上任意规则，改显隐：释义先显、词形收起 | 见下节 |
| 只背白名单原序 | 用户自己维护范围 | `none` | 白名单就是范围 |

## 三个必踩的坑

1. **`limit` 是全局截断。** `limit:50` + 2607 词 = 永远只练 50 个。要"每天 50"，只能拆词库分阶段，或不用配额。
2. **过滤可能清空队列。** 新库 `errors=0`、`correct=0`，`errors>0` 筛完是 0 条，用户打开是空白页。提交前必须 `test_algorithm` 看条数。
3. **没有事件就没有"智能"。** App 不记录任何学习行为；`record_learning_event` 只能由 Agent 按用户明确反馈写入。不要为了"让算法有数据"而编造事件。

## 揭示顺序（不改内容也能改）

| 训练目的 | 初始显隐 | ops 操作 |
| --- | --- | --- |
| 认词（看到词形想释义） | 词形显、释义隐、例句隐 | 默认形态，通常不用改 |
| 产出（看到释义写单词） | 释义显、词形隐、例句隐 | `update_cards` 把 `initially_visible` 对调，块 ID 保留 |
| 语境猜词 | 例句显、词形隐、释义隐 | 同上，只改显隐 |
| 听写 | 全隐，靠朗读 | 三块全 `false`，配合 App 朗读 |

只改显隐时不要重建块，不要改 `text`，避免丢原文和删除用户编辑。

## 节奏：只能靠分册

WordTok 没有时间维度，所以"三个月"只能这样落地：

1. 把词库按范围拆成 2–3 个阶段库（如 1–900 / 901–1800 / 1801–2607），`split_wordbook` 复制拆分或 source 生成时分开。
2. 每阶段一个库，白名单全开，`none` 原序。
3. 进入下一阶段时再配置新库；不用的库不动。
4. 阶段划分给用户确认，不要擅自按"每天 30 个"精确到天——没有这个能力。

分册超过 4 个就变成维护负担；宁愿少分。

## 四级三个月示例（真实配置）

假设：零基础、每天 30 分钟、目标过线（425）、使用 CET4 2607 词。

```json
{
  "scope": "2607 词全部进白名单",
  "algorithm": {"kind":"none"},
  "reveal": "词形先显；释义、例句收起",
  "session": "原序通刷，不设总量；一屏 6–8 条",
  "phased": ["CET4 核心词 (1–900)", "CET4 核心词 (901–1800)", "CET4 核心词 (1801–2607)"],
  "rationale": "首轮只要眼熟；没有事件历史，筛词和错词排序都没有意义",
  "risks": ["无每日配额，进度靠用户自控", "无例句，语境辨析做不了"],
  "expected_queue": 2607
}
```

第二轮（用户刷完 1–2 遍并反馈过错词后）：`errors-v1`，`expected_queue` 取 `test_algorithm` 实际返回条数，通常 100–400。

## 记录学习事件

只在用户明确说「这个我又忘了」「这个记住了」「刚才那题答错了」时写，一次一条：

```json
{"deckId":"bk_xxx","operation_id":"evt-20261027-0001",
 "event":{"id":"ev-20261027-0001","deckId":"bk_xxx","itemId":"e-4fd0653c4f",
          "type":"forgotten","at":1793000000000}}
```

- `type`：`viewed` / `revealed` / `remembered` / `forgotten` / `answered_correctly` / `answered_incorrectly`
- 只有 `forgotten`、`answered_incorrectly` 计 errors；只有 `remembered`、`answered_correctly` 计 correct；`viewed`/`revealed` 不计分但会更新无效（不记 `lastPracticedAt`）
- `at` 用当前毫秒时间戳；`id` 必须唯一，重试复用同一个 `operation_id`
- 「显示答案」不等于答对，不要自动记 `answered_correctly`

## 与 ops 的交接

`plan` 里必须能让 ops 直接执行：

- `algorithm.kind === "none"` → ops 调 `reset_algorithm`
- `algorithm.kind === "rules"` → ops 先 `create_algorithm`（用 `profile.id`/`name`），再 `test_algorithm` 核对条数，通过才 `set_algorithm`
- 显隐变更 → ops 用 `update_cards`，块 ID 从读回结果取
- 分册 → ops 用 `split_wordbook` 或 `compose_wordbook` 新建，别在同一个库上反复重排
