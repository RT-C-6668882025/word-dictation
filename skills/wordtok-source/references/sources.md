# 来源清单

只列**可核对**的来源。用法：先取词表，再用第二个来源抽查交集/差集；数字对不上就以实际读回的为准。

## 一、四级 CET-4

| 来源 | 规模 | 字段 | 许可 | 取法 |
| --- | --- | --- | --- | --- |
| qwerty-learner `CET4_T.json` | 2607 | `name` / `trans[]` / `usphone` / `ukphone` | GPL-3.0（随仓库） | `https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/CET4_T.json` |
| kajweb/dict `book/*_CET4_*.zip`、`*_CET4luan_*.zip` | 按分册 | 按册 | 未声明，只本地用 | 解压后看 `json`/`txt` |
| ECDICT `ecdict.csv`（7z） | 全库 77 万 | `word`/`phonetic`/`translation`/`pos`/`collins`/`oxford`/`tag`/`bnc`/`frq`/`exchange` | MIT | `tag` 含 `cet4` 的条目 ≈ 官方四级范围，可交叉核对 |
| 官方大纲 | 约 4500 词（含中学 2000） | 只有范围，无结构化词表 | 官方文本 | 中国教育考试网 `cet.neea.edu.cn`；只用于核对范围，不复制正文 |

要点：

- 2607 是**核心/高频**规模，不等于官方 4500。用户零基础时先说明这一点：核心词够过线，但阅读会遇到超纲词。
- qwerty 的释义是机器整理的中文，个别词性缺失（如 `cancel` 只有「取消，撤销；删去」没有 `v.`）。补词性用 ECDICT 的 `pos`/`translation` 对一遍，不要自己编。
- 例句：qwerty 的 `CET4_T` 没有例句。`4000_Essential_English_Words-sentence.json` 可作补充库，覆盖不到的词标 `missing`，不要批量生成当原文。

## 二、其他考试（同仓库，字段同上）

| 用途 | 文件 | 条数（实测） |
| --- | --- | --- |
| 六级 | `CET6_T.json` | 2345 |
| 考研 | `KaoYan_3_T.json` | 3728 |
| 高考 | `GaoKao_3500.json` | 3893 |
| 雅思 | `DuckCircle_IELTS.json` | 2644（另有多份机构版，质量不一） |
| 托福 | `Categorized_TOEFL_Vocabulary_by_Zhanghongyan.json` | 4123 |
| GRE | `GRE3000_3_T.json` | 3041 |
| 日语 | 仓库内 JLPT 分册（N1–N5） | 按级别取 |

不同来源的规模差异很大（雅思 2644 vs 官方 7000+），**报数时必须说清是哪一套**，不要让用户以为"雅思只要背 2600 词"。

## 三、增强字段

- **音标**：qwerty 的 `usphone`/`ukphone` 已够用；ECDICT `phonetic` 可补缺。
- **词性**：ECDICT `pos`（`n:64/v:36` 形式）或 `translation` 行首。
- **词频/难度**：ECDICT `bnc`、`frq`（数字越小越常见）、`collins`（1–5 星）、`oxford`（核心 3000）。用 `bnc`/`frq` 排序即成"高频优先"词表。
- **词形变化**：ECDICT `exchange`，做"只背原形/连带变形"时用。

## 四、许可与合规

| 类型 | 能做 | 不能做 |
| --- | --- | --- |
| MIT（ECDICT） | 内部使用、再分发（保留版权声明） | 去掉许可声明 |
| GPL-3.0（qwerty-learner） | 本地使用、转换格式自用 | 把数据打包进自己的闭源/商用产品 |
| 未声明（kajweb 等） | 本地自用 | 再分发、商用 |
| 商业词书/机构讲义 | 参考范围 | 整段复制进词库 |

## 五、取数命令

```sh
# 取词表到工作区
mkdir -p /var/minis/workspace/wordtok/src
wget -qO /var/minis/workspace/wordtok/src/cet4.json \
  https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/CET4_T.json

# 核对条数与字段（无 python 时用 grep -c '"name":'）
python3 -c "import json;d=json.load(open('/var/minis/workspace/wordtok/src/cet4.json'));print(len(d),d[0])"
```

ECDICT 全量约 200 MB，取之前先问：需要的只是 `tag` 含 `cet4` 的子集，还是全库。只为补几十个词性，改用 `qwerty` + 人工核对更划算。
