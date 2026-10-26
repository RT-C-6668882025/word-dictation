# 执行手册

所有示例只写结构性字段；真实调用时字段值一律来自读回结果或载荷文件。

## 0. 连接与握手

```http
POST <mcpUrl>
{"jsonrpc":"2.0","id":1,"method":"initialize",
 "params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"wordtok-ops","version":"1"}}}
```
400 `Unsupported protocol` → 换 `2025-03-26` / `2024-11-05`。随后 `notifications/initialized`（无 id），再 `tools/list`。

## 1. 新建词库（单批，≤500 卡）

```json
{"name":"compose_wordbook","arguments":{
  "operation_id":"wt-cet4-20261027-compose-1",
  "name":"CET4 核心词",
  "pages":[ ...来自 batch-01.json 的 pages... ]}}
```

读回：

1. `list_wordbooks` → 取 `book_id`，核对条数。
2. `get_wordbook_pages {book_id, offset:0, limit:20}` → 跟随 `next_offset` 直到读完，累加 `entries` 数量。

判定：`entries 总数 == manifest.count` 且页数一致。

## 2. 分批导入（>500 卡，用 manifest）

以 2607 词、480/批为例，目标 7 次调用（实测产物：6 批 480/480/480/480/480/207，每批约 150 KB，最终重排载荷 41 KB）：

```
1) compose_wordbook   batch-01（16 页 480 条）           → 得到 book_id
2) add_cards          page_id=末页, position=末页条数+1, cards=batch-02
3) add_cards          page_id=末页, position=<当前末页条数+1>, cards=batch-03
4) …                  直到最后一页（最多 5 次 add_cards）
5) set_wordbook_pages 全部 word_ids 按每页 30 重排（一次）→ 页标题、范围恢复整齐
6) 读回核对            get_wordbook_pages 全量累加 == 2607
```

关键点：

- 不要在批次之间重排页；最终一次 `set_wordbook_pages` 即可。中途页里堆 480–2400 条不影响 App 展示（它按屏幕高度自动切屏）。
- `position` 从 1 开始，追加时用"当前该页条数 + 1"。先用 `get_wordbook_pages` 读到该页实际条数，不要凭批次推算。
- 最终 `set_wordbook_pages` 的 payload：

```json
{"operation_id":"wt-cet4-20261027-pages-6","book_id":"bk_x",
 "pages":[{"id":"p-001","title":"CET4 核心词 0001–0030","word_ids":["e-...","e-..."]}, ...]}
```

规则：所有内容 ID 恰好出现一次；漏掉的页会被删除。生成这份 payload 时直接从读回结果拼，不要从本地 manifest 猜 ID。

- 如果 `add_cards` 因单页过大被拒（`failed`），改为每批新建一个 staging 页：`set_wordbook_pages` 追加 `{"id":"p-stage-2","title":"stage","word_ids":[]}` → `add_cards {page_id:"p-stage-2"}`。新编号重试。

## 3. 追加内容到已有库

```
get_wordbook_pages {book_id, offset:<最后一页>} → 记下 page_id、该页条数
add_cards {operation_id, book_id, page_id, position:<条数+1>, cards:[≤500]}
get_wordbook_pages {book_id, offset:<同一页>} → 条数增加了 N，ID 在末尾
```

`add_cards` 的 `in_whitelist` 默认 true；用户要"加了但先不练"时显式传 `false`。

## 4. 改内容 / 改显隐

```
读：get_wordbook_pages → 找到 entry.id 和 blocks[].id + 现有 text
写：update_cards {operation_id, book_id, cards:[{word_id:"e-...", blocks:[
      {id:"word", label:"词形", text:"cancel", format:"text", initially_visible:false},
      {id:"trans", label:"释义", text:"**'kænsl**　取消，撤销", format:"markdown", initially_visible:true}]}]}
读回：search_wordbook {book_id, word_ids:["e-..."]} → 块 ID、text、显隐一致
```

- 保留原 `id`，这样"块关联"不丢；不改的字段也要原样带上（整条覆盖语义）。
- 只改 `layout` 时只传 `layout`，其余保留。
- 改完全库显隐时按 500 条一批，**同一条目不要拆两次**。

## 5. 策略

```
create_algorithm {operation_id, profile:{id,name,version:1,algorithm}}
test_algorithm   {deckId, profileId}            → 只读预演，看 itemIds.length
set_algorithm    {operation_id, deckId, profileId}
get_learning_context {deckId}                    → activeProfileId 正确
```

- 必须先 `test_algorithm`。条数为 0 → 停，回报策略不可用，不要 `set_algorithm`。
- 条数与 `plan.expected_queue` 不符 → 记录差额，按实际值回报。
- 取消：`reset_algorithm {operation_id, deckId}`。

## 6. 白名单

```
add_to_whitelist {operation_id, book_id, word_ids:[≤500]}
→ 返回 changed_ids（可能少于请求，已在白名单的不算变更）
get_learning_context {deckId:book_id} → whitelistIds 长度 + 目标 ID 抽样核对
```

`remove_from_whitelist` 前必须用户明确说"这些不用背了"；不要用移出白名单表示"已掌握"。

## 7. 删除

```
1) 备份：get_words 全量（limit 500 分批）落 <workspace>/wordtok/backups/
2) 复述："将删除《CET4 核心词》2607 条，备份在 …，不可恢复。确认？"
3) delete_wordbook {operation_id, book_id, expected_name:"CET4 核心词"}
4) list_wordbooks → 该 ID 不存在；其他词库数量不变
```

`delete_cards` 同理，`word_ids` 来自读回，删完用 `get_wordbook_pages` 确认总数减少量 = 删除量。

## 8. 重命名 / 合并 / 拆分

- `rename_wordbook` → `list_wordbooks` 核对新名，旧名不存在。
- `merge_wordbooks {book_ids:[2–20], name}` → 新库条数 = 各源之和（不按正文去重）；源库保留。
- `split_wordbook` 默认复制：`{operation_id, book_id, word_ids, name}`；`move:true` 才移动，且必须 `expected_name` 精确匹配。

## 9. 学习事件

```json
{"name":"record_learning_event","arguments":{
  "deckId":"bk_x","operation_id":"wt-cet4-20261027-evt-1",
  "event":{"id":"ev-20261027-1","deckId":"bk_x","itemId":"e-4fd0653c4f",
           "type":"forgotten","at":1793000000000}}}
```

一次一条。用户没说就不记；不要为了"喂算法"批量伪造。

## 10. 超时与断连

| 现象 | 动作 |
| --- | --- |
| 25 秒无返回，消息含 `request_id` | 等 5 秒 → `get_operation_result {request_id}`；仍 `pending` 就等 10 秒再查，最多 3 次 |
| `status:"offline"` | 停手。告诉用户打开 App，然后**用原 operation_id** 重发 |
| `status:"busy"` | 已经有 20 个未完成请求。等前面的回执，不要换编号 |
| `status:"not_found"` | 回执被清理或从未提交。先读回真实状态；未写入再用**新**编号重做 |
| `status:"conflict"` | 编号被不同参数用过。换新编号 |
| HTTP 500 / 断连 | 不知道是否写入。先按 `operation_id` 查回执，查不到就读回状态，再决定 |

## 11. 汇报模板（给 Router / 用户）

```
已完成：CET4 核心词，2607 条，87 页
白名单：2607 条全在
算法：原序（无过滤），test_algorithm 返回 2607
备份：无（未做破坏性操作）
未完成：无
```
