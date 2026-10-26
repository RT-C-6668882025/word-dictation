---
name: wordtok-strategy
description: |
  为 WordTok 设计学习策略：把「四级三个月想过线」「只背错词」「每天 20 分钟」这类目标，翻译成 App 真实支持的三件事——白名单范围、排序/过滤规则、内容揭示顺序，并输出可直接提交的 algorithm profile。
  用户说「怎么背」「背哪些」「先背什么」「只背错词/生词」「考前怎么冲」「顺序怎么排」时使用。
  Knows what WordTok cannot do (no SRS, no daily quota, no auto event logging) and refuses to fake it.
---

# 定策略

你不是在写学习计划，你是在**配置一个没有间隔重复、没有每日配额、只按白名单排序播放的刷词器**。先把这一点吃透，再给方案。

先读 `../wordtok/references/mcp-contract.md` 的算法字段，以及 `references/playbook.md` 的场景表。

## 1. App 真正支持的三个旋钮

| 旋钮 | 能做什么 | 不能做什么 |
| --- | --- | --- |
| 白名单 | 决定「哪些词会进入练习队列」；不在白名单的词永远不出现 | 不能表达「今天新学 20 个」 |
| 规则（filter / sort / limit） | 对整个白名单做一次筛选、排序、截断 | 没有时间间隔、没有到期复习、没有难度自适应 |
| 内容块显隐 | 决定先看词形还是先看释义、例句何时出现 | 不能自动判断"答对" |

`limit` 是对**整个队列**截断，不是每日配额。用 `limit:50` 表达「每天 50 个」= 这个库永远只练 50 个词。这是最容易犯的错。

**需要节奏时，正确的做法是按阶段拆词库**（source 分册 / `split_wordbook`），一阶段启用一个；拆不动就不给节奏承诺，直接说明。

## 2. 先问清四件事

学习目标（过线/高分/阅读/写作/口语）、期限、当前水平、每天可投入时长。能推断的不问；只缺一个且会改变方案时问一个。

判断是否需要策略，而不是是否需要找词：**内容已有、问题是"怎么刷"时，你才出场。**

## 3. 事件是策略的前提

`errors` / `correct` / `lastPracticedAt` 只来自 `record_learning_event`，**App 不会自动记录**。所以：

- 没有事件历史的库，`filter errors>0` 会筛出 0 条 → 用户打开看到空白。
- `sort: "errors_desc"` 在没有事件时等价于原序，不会更"智能"。
- 首轮不要用基于错误的过滤；先按原序/随机刷，让用户明确说「这个忘了」「这个记住了」时再记录事件。

任何依赖事件的方案，必须在 `plan.risks` 里写明：**需要用户主动反馈才会生效。**

## 4. 三档默认方案

| 场景 | 白名单 | 算法 | 揭示顺序 |
| --- | --- | --- | --- |
| 首轮建立熟悉度（零基础/首考） | 全库 | `{"kind":"none"}` 原序 | 词形 → 释义 → 例句 |
| 二轮查漏（已有事件） | 全库 | filter `errors>0`，sort `errors_desc` | 词形先显，释义后显 |
| 考前抽查/自测 | 全库或分册 | sort `random` + `limit` = 一次想看的量 | **释义先显**，词形后显（反向回忆） |

细则与更多组合见 `references/playbook.md`。用户说「随便」就用第一档——不删、不改白名单、不加过滤。

## 5. 提交前自检

1. `filter` 在当前白名单上会不会为 0？会 → 换方案或先让用户刷一轮。必须让 ops 先 `test_algorithm` 预演，看到实际条数。
2. `limit` 是否符合用户本意（一次性总量 vs 每天）？写清在 `rationale`。
3. `sort: random` 必须给 `seed`（可复现），否则每次顺序都变。
4. profile 的 `id` 稳定（`cet4-errors-v1`），重复提交不会产生一堆同名配置。
5. 白名单调整是用户权利：策略只能建议，不能自己改。

## 6. 输出

```json
{"task_id":"...","producer":"wordtok-strategy","status":"ok","goal":"四级三个月过线",
 "handoff":{"plan":{
   "scope":"2607 词全部进白名单，不筛词",
   "algorithm":{"kind":"none"},
   "profile":null,
   "reveal":"词形先显；释义、例句默认收起",
   "session":"按原序，一屏 6–8 条；不设总量上限",
   "rationale":"首轮目标是建立眼熟，筛词会漏基础词；没有事件记录，任何 errors 过滤都会清空队列",
   "risks":["没有每日配额，节奏由用户自己控制","例句缺失，无法做语境辨析"],
   "expected_queue":2607}},
 "facts":[{"claim":"白名单 2607 条","evidence":"get_learning_context 返回 whitelistIds 长度 2607"}],
 "questions":[],"next":null}
```

`expected_queue` 必填：这是 ops 验证排序结果的依据。`profile` 为 `null` 时 ops 直接 `reset_algorithm`。

## 7. 硬规则

- 不承诺 App 没有的能力：间隔重复、艾宾浩斯排程、每日配额、自动判分、云同步。
- 不发明"遗忘曲线参数"，规则里只有 `errors`/`correct`/`lastPracticedAt`/`order` 四个字段。
- 不因为用户焦虑就堆配置。能用「原序 + 白名单」解决的，不加算法。
- 策略服务于用户目标，不服务于"看起来高级"。
