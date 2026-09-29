<div align="center">

# Word Dictation

**为实体手写板而生的极简批量英语默写工具。**

![Version](https://img.shields.io/badge/version-v0.3.0-171717?style=flat-square)
![Android](https://img.shields.io/badge/Android-APK-171717?style=flat-square)
![Local First](https://img.shields.io/badge/data-local--first-171717?style=flat-square)

不是背单词平台，不是 AI 助教，也不是又一个一张一张翻的卡片应用。  
导入词库，批量显示提示，在纸面 / 手写板上默写，然后自己判断哪些词还需要背。

[下载最新 APK](https://github.com/RT-C-6668882025/word-dictation/releases/latest) · [在线版本](https://rt-c-6668882025.github.io/word-dictation/)

</div>

---

## 为什么做它

很多背词软件默认你要在屏幕里完成整个学习过程：看一张卡、输入答案、点下一张、做间隔重复。

Word Dictation 的假设正好相反：

> **屏幕只负责出题和管理词库，真正的默写发生在实体手写板上。**

所以它刻意砍掉账号、社区、积分、复杂统计、AI 对话、花哨复习算法，只保留批量默写真正需要的部分。

## 功能

### 词库

- 支持创建多个独立词库
- 词库可重命名、删除
- 导入时固定每页单词数量
- 每页位置固定，适合反复按页默写
- 每页拥有独立「需要背」白名单
- 已会单词可以移出白名单，之后不再参与该页练习

### 导入

支持：

- 直接粘贴文本
- TXT
- CSV / TSV
- Markdown
- Excel（读取第一张表）
- 多种常见的「英文 + 中文」分隔形式

示例：

```text
abandon,放弃
ability 能力
absent | 缺席的
absolute <> 绝对的
achieve：达到
```

Markdown 表格也可以：

```markdown
| English | 中文 |
| --- | --- |
| abandon | 放弃 |
| ability | 能力 |
```

### 默写

- 中文提示
- 英文提示
- 中英全部显示
- 单个词可独立切换显示状态
- 一次显示 **10 / 20 / 30 / 40 / 50** 个
- 支持输入任意自定义显示数量
- 当前批次可整体标记「已会」
- 当前批次可整体重新加入白名单
- 自动显示本页总数、白名单数量、已会数量、本批数量和剩余数量
- 当前页完成后进入下一页

### Android / 更新

- Capacitor 打包 Android APK
- GitHub Actions 自动构建
- GitHub Release 提供直接 APK 下载
- App 内置「检查更新」
- 可直接进入项目仓库和最新 Release

## 设计原则

```text
导入词库
   ↓
固定分页
   ↓
白名单决定“哪些词需要背”
   ↓
选择本次显示数量
   ↓
在实体手写板上默写
   ↓
会了 → 移出白名单
不会 → 保留
   ↓
下一批
```

**The best part is no part.**

能不做的功能就不做。这个项目的目标不是把背单词做得更复杂，而是把「批量出题 → 手写 → 筛掉已会词」这条链路压到最短。

## 数据与隐私

词库数据保存在设备本地的 `localStorage` 中。

- 无账号
- 无登录
- 无业务后端
- 不上传词库
- 不需要云同步才能使用

卸载 App、清除应用数据或浏览器站点数据可能会删除本地词库，请自行保留原始词库文件。

## 技术栈

- React
- TypeScript
- Vite
- Capacitor
- SheetJS / xlsx
- Papa Parse
- Vite PWA
- GitHub Actions

## 本地开发

需要 Node.js。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

同步 Android：

```bash
npm run android:sync
```

首次创建 Android 工程：

```bash
npm run android:add
```

## 自动构建 APK

推送到 `main` 后，GitHub Actions 会自动：

1. 安装依赖
2. 构建 Web App
3. 创建并同步 Capacitor Android 工程
4. 生成 APK
5. 上传 Actions Artifact
6. 覆盖 `latest` Release 中的 `word-dictation.apk`

因此 Release 页面始终提供当前自动构建版本。

## 项目结构

```text
src/
├── App.tsx       # 词库、默写、关于、更新逻辑
├── parser.ts     # 文本 / CSV / TSV / Excel 解析
├── styles.css    # Tablet-first UI
└── main.tsx

.github/workflows/
├── android.yml   # Android APK 自动构建与发布
└── deploy.yml    # GitHub Pages
```

## Author

**RT-C-6668882025**

GitHub: https://github.com/RT-C-6668882025

---

<div align="center">

Built for handwriting, not another flashcard app.

</div>
