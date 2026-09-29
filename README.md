# Word Dictation

一个给物理手写板使用的极简批量默写器。

## 只做四件事

1. 批量导入单词（粘贴 / TXT / CSV / Excel / Markdown）
2. 一屏显示 10 / 20 / 30 / 40 个中文或英文提示
3. 写完后一次性显示答案
4. 点击错词标记，并只重练错词

支持「中 → 英」「英 → 中」「随机」三种方向。词库保存在浏览器 localStorage，无账号、无后端。

## 本地运行

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```

## 数据格式

直接粘贴即可，例如：

```
abandon,放弃
ability 能力
absent | 缺席的
absolute <> 绝对的\n\n| English | 中文 |\n|---|---|\n| achieve | 达到 |
```

Excel 默认读取第一张表的前两列。
