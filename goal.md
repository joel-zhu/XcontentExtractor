# XcontentExtractor — MVP 开发计划

下面我按"产品 → 架构 → 文件 → 核心算法 → MVP 开发顺序"展开。

## 一、先定义 MVP 的边界

第一版只解决一个问题：

"我正在浏览 X 上的一篇长文或线程，点击插件按钮，下载一个可读的 `.md` 文件。"

### 第一版支持

- 当前页是单条推文详情页时导出
- 当前页是 thread 时，把同作者连续内容合并导出
- 导出内容包括：
    - 标题
    - 作者名
    - 用户名
    - 发布时间
    - 正文段落
    - 图片链接
    - 引用内容
    - 原文链接

### 第一版不做

- 不做批量抓取
- 不做整账号归档
- 不做评论区全量导出
- 不做视频文件下载
- 不做"后台自动爬 X"
- 不追求 100% 还原网页样式
- **不做 Article 导出**（X Articles 仅限 Premium+ 用户创建，使用量极低，放到后续增强阶段）

这个边界很重要。你不是在做"Twitter Scraper"，而是在做"当前页导出器"。

## 二、推荐的整体架构

我建议是 5 层。

### 1. 页面检测层

职责：判断当前页是否可导出，以及属于什么类型。

输出示例：

- `tweet_detail`
- `thread`
- `unsupported`

### 2. 页面展开层

职责：在真正提取前，尽量把内容展开完整。

包括：

- 自动点击 "Show more" / "展开"
- 自动滚动若干轮
- 等待新节点加载
- 直到 DOM 基本稳定

### 3. 内容抽取层

职责：从当前 DOM 中拿出结构化内容，不直接拼 Markdown。

输出一个统一的中间数据结构，比如：

- 文档元信息
- 作者信息
- 正文块数组
- 图片数组
- 引用块
- 附加链接

### 4. Markdown 生成层

职责：把中间结构转为 Markdown 字符串。

自写 `renderMarkdown(blocks)` 纯函数即可（代码量不到 100 行），不需要引入 Turndown 等第三方库。因为我们的架构已经将 DOM 转为结构化 block，不是转换任意 HTML，自写渲染器更可控，也减小插件体积。

### 5. 下载层

职责：把 Markdown 变成文件下载到本地。

## 三、推荐的插件技术栈

如果做 Chrome / Edge：

- Manifest V3
- `content_scripts`
- `background service worker`
- `chrome.runtime.sendMessage`
- `chrome.downloads.download`
- `MutationObserver`

### 为什么这样分

- `content script` 负责读页面 DOM
- `background` 负责下载、状态管理
- popup 只是触发按钮，不做重逻辑

这比"所有逻辑都写在 popup"稳定得多。

### ⚠️ Manifest V3 的关键约束

开发前必须理解 MV3 和 MV2 的核心差异：

#### 1. Service Worker 是非常驻的

MV3 的 background 从 persistent background page 变成了 event-driven service worker。空闲约 30 秒后会被终止，全局变量会丢失。

**影响：**
- 如果 content script 花 15 秒展开页面，background service worker 可能已经被 kill
- popup 关闭后，popup 的回调函数不存在了

**解决方案：**
- content script 完成所有提取工作后，通过 `chrome.runtime.sendMessage` 发送结果。这一步是瞬时的，会自动唤醒 service worker
- 状态持久化使用 `chrome.storage.local`，不要依赖全局变量
- 长 thread 展开期间，可用定期 `chrome.runtime.sendMessage` 保持 service worker 存活（keepAlive 心跳）
- popup 显示状态应从 `chrome.storage` 读取，而非依赖消息回调

#### 2. Service Worker 中无法使用 `URL.createObjectURL`

Service Worker 没有 DOM 和 `window` 对象，无法创建 Blob URL。

**下载方案（按推荐顺序）：**

- **方案 A（推荐）：Data URL 下载**
  ```javascript
  // 在 background service worker 中
  chrome.downloads.download({
    url: 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown),
    filename: sanitizedFilename
  });
  ```
  Data URL 有 ~2MB 大小限制，对绝大多数推文/thread 导出绰绰有余。

- **方案 B：Offscreen Document**
  ```javascript
  // 如果未来需要处理超大文件
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Generate download blob'
  });
  ```

- **方案 C（兜底）：Content Script 内下载**
  在 content script 中用 `<a>` 标签 + `click()` 触发下载（简单可靠但缺少 downloads API 的文件名控制）。

## 四、推荐的项目目录

你可以按这个组织：

- `manifest.json`
- `src/background/index.js`
- `src/content/index.js`
- `src/content/pageDetector.js`
- `src/content/pageExpander.js`
- `src/content/extractors/threadExtractor.js`
- `src/content/extractors/tweetExtractor.js`
- `src/content/selectors.js` ← **集中管理所有 DOM 选择器**
- `src/content/normalize.js`
- `src/shared/markdownRenderer.js`
- `src/shared/types.js`
- `src/popup/popup.html`
- `src/popup/popup.js`
- `src/popup/popup.css`
- `tests/snapshots/` ← **页面快照用于离线测试**

如果你想更快，甚至可以先简化成：

- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`
- `popup.js`

但从长期维护看，最好还是拆 extractor。

### 为什么需要 `selectors.js`

将所有 DOM 选择器集中到一个配置文件中，X 页面变化时只需更新这一个文件：

```javascript
// src/content/selectors.js
export const SELECTORS = {
  // 优先使用 data-testid（X 的测试属性，变更频率较低）
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  tweet: 'article[data-testid="tweet"]',
  tweetPhoto: '[data-testid="tweetPhoto"] img',

  // 语义化标签作为备选
  timeElement: 'time[datetime]',
  articleElement: 'article',

  // 结构化选择器
  mainColumn: '[data-testid="primaryColumn"]',
};
```

## 五、Manifest 应该怎么想

你现在不需要追求复杂权限，只需要够用。

第一版大概需要这些能力：

- 匹配 `https://x.com/*`
- 注入 content script
- 使用 `downloads`
- 使用 `activeTab`
- 使用 `storage`（用来保存导出偏好和状态同步）

### 权限思路

- `activeTab`：拿当前活动页权限
- `downloads`：下载 `.md`
- `storage`：保存选项（文件名模板、是否包含图片链接）+ 跨组件状态同步
- `host_permissions`：给 `https://x.com/*`

### popup 的职责

popup 只做三件事：

- 显示"当前页面可否导出"
- 点击导出
- 显示结果或错误

不要把 DOM 解析放 popup 里。

## 六、内容抽取的数据结构

这一层最关键。

你要先定义一个统一结构，而不是想到什么拼什么。

我建议用这样的概念模型：

### 文档对象 `DocumentModel`

字段建议：

- `source`: `x`
- `pageType`: `tweet_detail | thread`
- `title`
- `url`
- `author`
- `publishedAt`
- `extractedAt` ← 导出时间戳，文档头部会用到
- `language` ← 推文语言（多语言推文需要记录）
- `description`
- `blocks`
- `media`
- `hashtags` ← 标签列表，Markdown 中可保留为链接
- `mentions` ← @提及列表
- `metadata`
- `threadInfo` ← Thread 专用信息

### 作者对象 `author`

字段：

- `name`
- `username`
- `profileUrl`

### Thread 信息 `threadInfo`

字段（仅 `pageType === 'thread'` 时存在）：

- `totalCount`: 页面中检测到的 thread 推文总数
- `extractedCount`: 实际成功提取的推文数
- `isComplete`: 是否认为提取完整（`extractedCount === totalCount`）

这让用户知道导出是否有遗漏。

### 内容块 `blocks`

每个 block 有：

- `type`
- `text`
- `children`
- `url`
- `alt`
- `meta`
- `tweetId` ← Thread 中每条推文的 ID，便于溯源
- `timestamp` ← 每条推文的独立时间戳

### block 类型建议

第一版支持这些就够了：

- `paragraph`
- `heading`
- `image`
- `quote`
- `tweet_embed`
- `link`
- `separator`

这样做的好处是：

- 以后 DOM 变了，只改 extractor
- Markdown 生成器可以完全复用
- 将来想导出 HTML / JSON / Notion，也很方便

## 七、页面识别逻辑怎么写

X 是 SPA，所以你不能只看加载时 URL，一定要"进入页面时判定 + 路由变化后重判定"。

### SPA 路由变化监听（关键）

X 是 React SPA，页面跳转不会触发 content script 重新注入。`DOMContentLoaded` 只会在首次加载时触发一次。必须主动监听路由变化：

```javascript
// 方法 1：拦截 History API（主要）
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  onRouteChange();
};
history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  onRouteChange();
};
window.addEventListener('popstate', onRouteChange);

// 方法 2：URL 轮询（兜底，防止漏检）
let lastUrl = location.href;
const urlPoller = setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    onRouteChange();
  }
}, 1000);

// 方法 3：MutationObserver 观察主区域变化（辅助）
// 可用于确认新页面内容已加载完成
```

三种方法配合使用，确保路由变化不遗漏。

### 可以先从 URL 识别

粗略规则：

- `x.com/{username}/status/{id}` → tweet detail
- 同一个 detail 页中如果检测到多条同作者连续主内容 → thread

### DOM 选择器优先级

不要只靠类名。X 页面的 CSS 类名是打包后的随机哈希，每次部署可能变化。按以下优先级选择：

| 优先级 | 选择器策略 | 稳定性 | 备注 |
|--------|-----------|--------|------|
| 1 | `data-testid` 属性 | ⭐⭐⭐⭐ | X 的测试用属性，变更频率较低 |
| 2 | 语义化 HTML 标签 (`article`, `time`, `a[href]`) | ⭐⭐⭐ | 遵循 HTML 语义规范 |
| 3 | 结构位置关系 (parent > child) | ⭐⭐ | 结构重构时会失效 |
| 4 | CSS 类名 | ⭐ | 打包后随机哈希，**不可依赖** |

常用的稳定 `data-testid` 值：

- `data-testid="tweet"` — 推文容器
- `data-testid="tweetText"` — 推文正文
- `data-testid="User-Name"` — 用户名区域
- `data-testid="tweetPhoto"` — 图片容器
- `data-testid="primaryColumn"` — 主内容列

### 推荐判定顺序

1. 看 URL → 确认是 `status` 页
2. 等待主内容 DOM 加载（用 `MutationObserver` 或轮询等待 `article[data-testid="tweet"]` 出现）
3. 如果是 status 页：
    - 有且仅有一条主贴 → `tweet_detail`
    - 有多条同作者连续贴 → `thread`

## 八、页面展开层怎么设计

这一步决定"导出是否完整"。

### 需要处理的情况

- "显示更多"
- 长线程未完全渲染
- 图片延迟加载
- 部分引用内容未出现

### 如何确定"主详情区域"的边界

X 的推文详情页中，主贴和回复区没有明显的 DOM 分隔。必须用程序化方式界定边界：

**主区域判断规则：**

1. 找到主贴 — 页面中第一个 `article[data-testid="tweet"]`
2. 向下遍历后续的 `article` 节点
3. 如果是同作者 → 属于 thread，继续
4. 遇到**第一个非原作者**的推文 → 认为 thread 结束，到达回复区
5. 只在 "主贴 → thread 最后一条" 的 DOM 范围内做展开和滚动

**辅助判断：**

- 时间戳连续性：同一 thread 内推文时间通常在几分钟之内
- 如果两条同作者推文之间间隔超过数小时，可能不属于同一 thread

### 展开算法建议

做一个 `expandPage()`：

1. 锁定主详情区域的 DOM 范围（见上述边界规则）
2. 在该范围内查找"展开"按钮并点击
3. 记录当前主内容块数量
4. 向下滚动一屏（仅滚动到主区域底部，不进入回复区）
5. 等待 500ms 到 1200ms
6. 再次数内容块数量
7. 如果连续几轮都没增长，就停止

### 终止条件

满足任一即可停止：

- 连续 3 轮没有新增内容
- 达到最大滚动次数，比如 10～15 次
- 达到最大等待时间，比如 12 秒
- **已滚过第一个非原作者推文**（进入回复区则立即停止）

### 为什么要限制

避免：

- 无限滚动
- 把评论区越滚越多
- 卡住用户页面

## 九、抽取层的实现思路

### 1. Tweet 抽取器

单条推文详情页要拿：

- 作者
- 用户名
- 发布时间
- 正文文本
- 图片
- 外链
- 引用推文

这里不要直接 `innerText` 整块拿，否则会混入：

- 回复数
- 转发数
- 点赞数
- 按钮文字
- 菜单项

要先用 `[data-testid="tweetText"]` 锁定正文文本容器，再提取内容。

### 2. Thread 抽取器

这是最有价值也最难的部分。

#### thread 识别原则

以当前主贴为起点，向下找：

- 同作者
- 同详情上下文中
- 语义上连续的多条贴文

#### Thread 边界判断（程序化规则）

```javascript
function extractThreadTweets(mainTweet, allTweets) {
  const author = getAuthor(mainTweet);
  const threadTweets = [mainTweet];

  for (const tweet of allTweets) {
    // 遇到非原作者 → thread 结束
    if (getAuthor(tweet) !== author) break;
    // 同作者 → 加入 thread
    threadTweets.push(tweet);
  }

  return threadTweets;
}
```

#### 第一版最简单做法

只合并：

- 当前详情页里
- 与主贴同作者
- 位于主详情流中
- 按出现顺序连续的推文

不去做复杂"树状回复关系"推断。

#### 输出方式

把每条推文当作一个 section：

- 第一条当标题来源
- 后续推文作为正文段落块
- 每条之间加分隔
- 每条标注 `tweetId` 和 `timestamp`

这比"强行合并成一整段"更清晰。

### 3. Article 抽取器（后续增强，不在 MVP 中）

Article 是 X Premium+ 功能，使用量极低。放到 MVP 完成后作为增强功能开发。届时策略是：

- 找主标题
- 找作者/时间
- 找正文容器
- 克隆正文 DOM
- 清理多余节点
- 转 Markdown

## 十、一个非常重要的设计：先清洗 DOM，再转 Markdown

不要直接对原始节点做 HTML→Markdown。

因为 X 页面会有很多噪音：

- 按钮文本
- 隐藏辅助文本
- 无障碍标签
- 菜单图标
- 重复链接
- 统计数字

### 正确流程

1. 克隆目标节点
2. 删除噪音节点
3. 规范化剩余节点
4. 再交给 Markdown 渲染器

### 规范化动作

比如：

- 把 emoji 图片替换成文本
- 把图片节点转换成统一的 `image block`
- 把引用卡片转成 `quote block`
- 把换行处理成段落

## 十一、Markdown 生成规则

这一层尽量纯函数化。自写渲染器，不引入第三方库。

### 头部建议

生成一个干净的文档头：

- 标题
- 作者
- 用户名
- 发布时间
- 原文链接
- 导出时间（来自 `DocumentModel.extractedAt`）

例如文档开头结构可以是：

- 第一行标题
- 接着是作者和链接信息
- 然后一个分隔线
- 再进入正文

### block 转换建议

- `heading` → `#` / `##`
- `paragraph` → 普通段落
- `image` → `![alt](url)`
- `quote` → `> 引文`
- `tweet_embed` → 可以简化为：
    - `> 引用 @username: ...`
- `separator` → `---`

### Thread 的 Markdown 呈现

建议每条推文单独一个二级标题，类似：

- `## Post 1`
- 内容
- `## Post 2`
- 内容

如果你觉得英文别扭，就写：

- `## 第 1 条`
- `## 第 2 条`

### Thread 尾部提示

如果 `threadInfo.isComplete === false`，在文档末尾追加：

```markdown
---

> ⚠️ 本次导出可能不完整。检测到 {totalCount} 条推文，实际提取 {extractedCount} 条。
```

## 十二、文件命名规则

文件名也要设计好，否则用户体验很差。

### 推荐格式

- `x-用户名-日期-标题摘要.md`

比如：

- `x-jack-2026-03-15-some-title.md`

### 文件名清洗

要去掉：

- `/ \ : * ? " < > |`
- 过长标题截断，比如只保留前 40 字符

## 十三、Popup 交互怎么做

第一版 popup 非常简单就够了。

### 状态 1：当前页不可导出

显示：

- "当前页面不是可导出的 X 文章或线程"

### 状态 2：当前页可导出

显示：

- 页面类型：Thread / Tweet
- 一个按钮：`导出 Markdown`

### 状态 3：处理中

显示：

- "正在展开内容…"
- "正在生成 Markdown…"

### 状态 4：完成

显示：

- "已下载"

### 状态 5：部分完成

显示：

- "已下载（部分内容可能不完整）"

不要在 popup 里展示大预览，第一版没必要。

popup 的状态应从 `chrome.storage.local` 读取，因为 popup 可能被关闭后重新打开。

## 十四、消息流怎么设计

建议通信流程是：

1. 用户点击 popup 按钮
2. popup 向 content script 发送 `EXPORT_MARKDOWN`
3. content script：
    - 检测页面
    - 展开（展开期间定期向 background 发 keepAlive 心跳）
    - 提取
    - 生成 markdown
4. content script 把 markdown 字符串和文件名发给 background
5. background 用 Data URL + `chrome.downloads.download` 下载文件
6. background 把完成状态写入 `chrome.storage.local`
7. popup（如果还开着）从 storage 读取状态更新 UI

### 为什么下载放 background

因为：

- `chrome.downloads` API 只在 background / service worker 中可用
- 管理下载更稳定
- popup 关闭也不至于中断逻辑

### 为什么状态用 storage 而非消息回调

因为：

- popup 可能在处理过程中被关闭
- Service worker 可能被杀后重启
- storage 是唯一持久且跨组件的状态通道

## 十五、错误处理要提前设计

第一版最常见的问题不是"代码不会跑"，而是"页面结构和预期不一样"。

### 错误类型

你至少要区分这些错误：

- `UNSUPPORTED_PAGE`
- `CONTENT_NOT_FOUND`
- `EXPAND_TIMEOUT`
- `EXTRACTION_FAILED`
- `DOWNLOAD_FAILED`

### 用户提示

popup 只显示人话即可：

- 当前页面暂不支持
- 没有找到正文
- 页面内容尚未加载完整，请稍后重试

### 部分成功处理（重要）

不要让一个小错误毁掉整次导出。关键原则：**能导出多少就导出多少。**

- **Thread 部分提取**：如果 20 条的 thread 只提取了 15 条就超时了，应导出已有的 15 条，而不是报 `EXTRACTION_FAILED`。在文档末尾标注不完整信息。
- **展开超时降级**：`EXPAND_TIMEOUT` 后，不展开也要继续提取已有内容。展开只是"提高完整率"，不是前置条件。
- **提取容错降级**：如果结构化 block 提取某条推文失败，尝试 fallback 到 `innerText` + 基本清洗，标注为 `[可能存在格式问题]`。

### 降级策略总结

```
正常流程：展开 → 结构化提取 → 生成 Markdown → 下载
            ↓ 超时        ↓ 失败
            跳过展开      fallback innerText
            继续提取      标注格式问题
                          继续生成
```

## 十六、最小开发顺序

这是最关键的部分。我建议你按这个顺序做，不要一上来就追求 thread 完美抽取。

### 第 1 步：先跑通"当前页文本下载"

目标：

- 在 X 页面点击按钮
- 下载一个 `.md`
- 内容先随便写死都行

意义：

- 先验证 manifest、popup、background、downloads 整条链路是通的
- **特别要验证 Data URL 下载方案在 Service Worker 中能正常工作**

### 第 2 步：支持单条推文详情导出

目标：

- 在 `status` 页找到主贴
- 导出作者、时间、正文、链接

这是最合适的第一个真实功能。

### 第 3 步：加入图片导出链接

目标：

- 识别推文内图片
- 在 Markdown 中插入图片 URL

注意：

- 第一版只放链接，不下载图片文件

### 第 4 步：支持 thread 合并

目标：

- 识别同作者连续推文
- 生成一个合并文档
- 标注 thread 完整性

这是你的核心卖点之一。

### 第 5 步：做页面展开器

目标：

- 自动点击"展开"
- 自动滚动
- 提高完整率

这一步应该放在已有基本导出能力之后，不然调试很痛苦。

### 第 6 步：完善错误处理和降级

目标：

- 实现部分成功导出
- 实现展开超时降级
- 实现提取容错降级
- 优化文件名

### 后续增强

- Article 抽取器
- 更好的引用卡片转换
- 设置页
- 调试页

## 十七、一个很实用的调试方法

你在开发时，强烈建议加一个"调试模式"。

### 调试模式下输出

- 当前检测到的页面类型
- 找到的主节点数量
- 抽取到的 block 数量
- 最终 Markdown 预览前 500 字
- 哪一步失败
- 用到的选择器是否命中

### 为什么重要

X 的页面会变（业界经验：维护 X 爬虫每月需 10-15 小时），调试信息越明确，你后面维护越轻松。

## 十八、测试策略

X 的 DOM 会频繁变化，必须有可靠的测试手段。

### 1. 快照测试（离线验证）

- 保存典型 X 页面的 HTML 到 `tests/snapshots/` 目录
- 包含：单条推文页、thread 页、各种边界情况
- 对这些 HTML 快照运行 `detectPageType()` + `extractDocumentModel()`，验证输出结构

优势：不需要访问真实 X 就能跑测试，CI 友好。

### 2. 选择器健康检查

在调试模式下，加一个 `checkSelectors()` 函数：

```javascript
function checkSelectors() {
  const results = {};
  for (const [name, selector] of Object.entries(SELECTORS)) {
    results[name] = {
      found: document.querySelectorAll(selector).length,
      selector: selector
    };
  }
  console.table(results);
  return results;
}
```

定期在真实 X 页面上运行，快速发现哪些选择器已经失效。

### 3. 输出结构校验

写一个简单的 `validateDocumentModel(model)` 函数，检查必填字段是否存在：

```javascript
function validateDocumentModel(model) {
  const errors = [];
  if (!model.title) errors.push('缺少标题');
  if (!model.author?.username) errors.push('缺少作者');
  if (!model.blocks?.length) errors.push('没有内容块');
  if (model.pageType === 'thread' && !model.threadInfo) {
    errors.push('Thread 类型缺少 threadInfo');
  }
  return errors;
}
```

## 十九、你真正要小心的风险

### 1. DOM 变动风险

这是最大风险。

解决办法：

- 优先用 `data-testid`，其次用语义化标签
- 将所有选择器集中到 `selectors.js`，方便统一更新
- 提取逻辑分模块
- 利用快照测试 + 选择器健康检查尽早发现问题

### 2. 线程误判风险

可能把回复当正文，也可能漏掉 thread 中一条。

解决办法：

- 第一版只取"当前详情流里同作者连续块"
- 遇到第一个非原作者推文即停止
- 可用时间戳连续性辅助判断
- 不做复杂推断

### 3. 无限展开风险

页面自动滚动太猛，可能把评论区也卷进去。

解决办法：

- 限最大轮数
- 限最大时长
- 只在主区域内寻找新块
- 滚过第一个非原作者推文就停止

### 4. Markdown 噪音风险

直接取整块文本会带出大量 UI 垃圾。

解决办法：

- 先清洗 DOM
- 再转换

### 5. X 内部接口诱惑

你后面很可能会想："要不直接抓网络请求吧，数据更干净。"

这个可以做辅助，但不建议做主依赖。因为 X 的 API 抓取长期不稳定（GraphQL doc_ids 频繁轮换、token 绑定浏览器指纹），维护成本高。

### 6. Service Worker 超时风险

展开耗时导致 background 被杀。

解决办法：

- 展开期间用 keepAlive 心跳
- 核心逻辑在 content script 完成
- 只在最后一步发消息给 background 做下载
- 状态持久化到 storage

## 二十、我建议你的第一版里就留两个开关

即便 UI 很简单，也建议保留两个设置项：

- `包含图片链接`
- `Thread 按分节导出 / 合并导出`

这样以后不用改大结构。

## 二十一、最值得你先写的 4 个核心函数

如果你明天就开工，我建议先写这 4 个：

### 1. `detectPageType()`

返回：

- `tweet_detail`
- `thread`
- `unsupported`

### 2. `expandPageIfNeeded()`

负责：

- 锁定主区域边界
- 点击展开
- 在主区域内滚动
- 等待稳定
- 超时则降级跳过

### 3. `extractDocumentModel()`

根据页面类型调用不同 extractor，返回统一 `DocumentModel`

### 4. `renderMarkdown(documentModel)`

把统一结构转成最终 `.md`

只要这四个函数结构对了，后面都是往里填细节。

## 二十二、给你的开工路线图

如果按"2～3 晚做出 MVP"来估算，可以这样排：

### 第 1 晚

- 建插件骨架
- popup 按钮
- background Data URL 下载（验证 MV3 下载方案）
- content script 通信和 SPA 路由监听
- 成功下载一个固定文本文件
- 建立 `selectors.js` 配置

### 第 2 晚

- 实现单条推文导出
- 用 `data-testid` 选择器提取作者、时间、正文
- 生成基础 Markdown
- 加入基本错误处理

### 第 3 晚

- 实现 thread 合并（同作者连续推文）
- 加图片链接
- 优化文件名
- 加入部分成功处理
- 保存一组 HTML 快照用于测试

### 后续增强

- 页面展开器
- Article 抽取器
- 更好的引用卡片转换
- 设置页
- 调试页 + 选择器健康检查

## 二十三、最终建议

如果你想把这个项目做成"真的能长期维护"，请坚持这四个原则：

### 原则 1：以当前已渲染页面为主

这是最稳、最省钱的路线。

### 原则 2：先统一数据结构，再渲染 Markdown

不要 DOM 抽一点就拼一点。

### 原则 3：先做 tweet/thread，再做 article

因为 tweet detail 更容易验证，能更快跑通 MVP。Article 放到后续增强。

### 原则 4：选择器集中管理，降级优雅处理

所有 DOM 选择器放在 `selectors.js`，所有失败场景都有降级路径。这是长期维护的基础。