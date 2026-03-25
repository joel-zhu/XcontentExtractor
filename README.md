# XcontentExtractor

[English](./README_EN.md) | [中文](./README.md)

将 X (Twitter) 上的推文、Thread（连续推文串）和长文 (Article) 一键导出为格式优美的 Markdown 文件。

## ✨ 功能特性

| 内容类型 | 支持状态 | 说明 |
|----------|----------|------|
| 单条推文 (Tweet) | ✅ 已完成 | 提取正文、图片、视频、引用推文、链接、Hashtag、@提及 |
| 连续推文串 (Thread) | ✅ 已完成 | 自动识别并提取同一作者的连续多条推文，合并为一篇文档 |
| 长文 (Article) | ✅ 已完成 | 自动进入专注模式、滚动加载全文、提取标题/正文/图片/列表/引用 |
| 视频提取 | ✅ 已完成 | 通过拦截 GraphQL API 获取最高清的 mp4 视频直链 |

---

## 🏗️ 技术栈

- **平台**：Chrome Extension (Manifest V3)
- **语言**：纯 JavaScript（无框架依赖、无构建工具）
- **权限**：`activeTab`、`downloads`、`storage`
- **兼容域名**：`x.com`、`twitter.com`

---

## 📁 项目结构

```
XcontentExtractor/
├── manifest.json                         # MV3 扩展清单
├── icons/                                # 扩展图标 (16/48/128px)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   └── index.js                      # Service Worker 后台脚本
│   │                                     # 处理下载请求、消息中转
│   ├── content/
│   │   ├── index.js                      # Content Script 主入口
│   │   │                                 # 页面类型检测 → 展开 → 提取 → 渲染 → 下载
│   │   ├── selectors.js                  # 所有 DOM 选择器集中管理
│   │   │                                 # 包括推文、长文的 data-testid 和 .longform-* 类名
│   │   ├── normalize.js                  # 文本标准化工具
│   │   │                                 # 处理换行、空白、特殊字符
│   │   ├── pageDetector.js               # 页面类型检测器
│   │   │                                 # 判断当前页面是 tweet_detail / thread / article
│   │   ├── pageExpander.js               # 页面自动展开器
│   │   │                                 # 自动滚动加载完整内容、点击长文专注模式按钮
│   │   └── extractors/
│   │       ├── tweetExtractor.js         # 单条推文提取器
│   │       │                             # 提取正文、作者、时间、图片、引用推文、链接
│   │       ├── threadExtractor.js        # Thread 提取器
│   │       │                             # 收集同一作者的连续推文
│   │       └── articleExtractor.js       # 长文提取器
│   │                                     # 使用 .longform-* 扁平化提取策略
│   ├── popup/
│   │   ├── popup.html                    # 弹窗 UI 结构
│   │   ├── popup.css                     # 弹窗样式
│   │   └── popup.js                      # 弹窗逻辑
│   │                                     # 显示页面类型、状态、触发导出
│   └── shared/
│       ├── types.js                      # 通用数据模型定义
│       │                                 # DocumentModel、Author、Block 等结构
│       └── markdownRenderer.js           # Markdown 渲染器
│                                         # 将 DocumentModel 转为 .md 文本
├── tests/                                # 导出的测试文件存放目录
├── testURL.md                            # 测试用 URL 集合 (Tweet/Thread/Article)
├── goal.md                               # 项目需求与目标文档
├── learnedFromBugs.md                    # 踩坑经验与教训总结
├── 250323-handoff.md                     # 视频功能交接文档
└── 编程继承者.md                           # 交接文档模板
```

---

## 🔧 安装与使用

### 安装步骤
1. 克隆或下载本项目到本地
2. 打开 Chrome 浏览器，地址栏输入 `chrome://extensions/`
3. 开启右上角的 **「开发者模式」**
4. 点击 **「加载已解压的扩展程序」**，选择本项目根目录
5. 扩展安装成功后，工具栏会出现 XcontentExtractor 图标

### 使用方法
1. 在 X (Twitter) 上打开一条推文、一个 Thread 或一篇长文
2. 点击浏览器工具栏上的 XcontentExtractor 图标
3. 弹窗会显示当前检测到的页面类型（如「推文详情」「Thread」「X 长文」）
4. 点击 **「导出 Markdown」** 按钮
5. 扩展会自动展开全部内容（包括懒加载内容和长文专注模式），然后生成并下载 `.md` 文件

### 开发调试
- 修改代码后，进入 `chrome://extensions/` 页面点击扩展卡片上的 🔄 刷新按钮
- 在 X 页面按 F12 打开 DevTools，Console 中查看 `[XCE]` 或 `[XCE-Article]` 开头的调试日志
- 运行 `window.XCE.checkSelectors()` 可以在 Console 中查看所有选择器的匹配情况

---

## 🧱 核心架构

### 数据流

```
用户点击导出按钮
    │
    ▼
popup.js ──消息──▶ content/index.js (handleExport)
                        │
                        ├── 1. pageDetector.js → 检测页面类型
                        ├── 2. pageExpander.js → 自动展开内容
                        ├── 3. extractors/*    → 提取结构化数据 (DocumentModel)
                        ├── 4. markdownRenderer.js → 渲染为 Markdown 文本
                        └── 5. 发消息给 background/index.js → 触发文件下载
```

### DocumentModel 数据结构

所有提取器最终输出统一的 `DocumentModel` 对象：

```javascript
{
  title: '推文标题或前60字',
  author: { name: '显示名', username: 'handle', profileUrl: '...' },
  publishedAt: '2026-03-23T12:00:00.000Z',
  sourceUrl: 'https://x.com/user/status/123',
  type: 'tweet_detail' | 'thread' | 'article',
  blocks: [
    { type: 'paragraph', content: '正文内容' },
    { type: 'heading', level: 2, content: '标题' },
    { type: 'image', url: 'https://pbs.twimg.com/...', alt: '图片描述' },
    { type: 'quote', content: '引用文本' },
    { type: 'list', ordered: false, items: ['项1', '项2'] },
    { type: 'code', content: '代码块内容' },
    { type: 'link', url: '...', content: '链接文字' },
    { type: 'video', url: 'https://video.twimg.com/...' },
  ],
  media: [],
  hashtags: [],
  mentions: [],
}
```

### 选择器管理策略

所有 DOM 选择器集中在 `src/content/selectors.js` 中管理。当 X 前端更新 DOM 结构时，只需修改此文件。选择器优先级遵循：

```
data-testid > 语义化标签 > 结构位置 > CSS 类名
```

长文 (Article) 场景额外使用推特底层的 `.longform-*` 系列 CSS 类名进行扁平化提取。

---

## 📝 Markdown 输出格式示例

### 单条推文
```markdown
# 推文标题（正文前60字）

---
- Author: DisplayName (@username)
- Published: 2026-03-23T12:00:00.000Z
- Source: https://x.com/user/status/123
- Type: Tweet
---

正文内容……

![Image](https://pbs.twimg.com/media/xxx?format=jpg&name=large)
```

### 长文 Article
```markdown
# 你不知道的 Claude Code：架构、治理与工程实践

---
- Author: Tw93 (@HiTw93)
- Published: 2026-03-12T...
- Source: https://x.com/HiTw93/article/...
- Type: Article
---

## 0. 太长不读

今天这篇文章源于最近半年深度使用 Claude Code……

## 1. 整体架构

……
```

---

## ⚠️ 已知限制

1. **需要登录**：扩展依赖已登录的 X 会话才能访问推文内容
2. **SPA 路由**：X 使用 SPA 路由，页面类型检测依赖 URL 变化事件监听
3. **选择器时效性**：X 的 DOM 结构可能随前端版本更新而变化，需定期维护 `selectors.js`

---


---

## 🙏 致谢

- [x2markdown](https://github.com/RuochenLyu/x2markdown) — 开源项目，为本项目的长文提取提供了关键的 `.longform-*` 选择器思路
