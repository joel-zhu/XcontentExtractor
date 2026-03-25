# XcontentExtractor - 踩坑经验与教训总结

本文档记录了在开发 XcontentExtractor 过程中遇到的技术问题、失败的尝试、最终的解决方案，以及从中提炼出的通用性开发经验。这份文档既是给未来维护者的避坑指南，也是对 AI Agent 协作开发模式的复盘。

---

## Bug #1：长文 (Article) 提取始终返回"没有找到正文内容"

### 问题背景
X 的网页端 DOM 结构由于使用了 React Native for Web 框架和高度原子化的 CSS (`css-xxxxxx`)，使得传统的基于 HTML 语义化标签（如 `<article>`, `<p>`）的爬虫方案完全失效。所有内容几乎都被包裹在没有任何明显语义的、深度嵌套的 `<div>` 和 `<span>` 当中。此外，长文页面还是一个单页面路由 (SPA) 应用，内容会随着滚动动态渲染和销毁。

### 踩坑记录

#### 尝试一：依赖 `data-testid` + `cloneNode` + 递归 DOM 遍历
* **做法**：尝试寻找 `[data-testid="noteComponent"]` 作为容器，用 `cloneNode(true)` 克隆 DOM 后在离线副本上递归遍历、提取文本
* **失败根源 1 (离线 DOM 的 innerText 陷阱)**：浏览器认为 `cloneNode` 产生的离线节点未被渲染，调用 `innerText` 统一返回**空字符串**。应该用 `textContent` 替代
* **失败根源 2 (容器名称不固定)**：长文容器有时叫 `noteComponent`，有时叫 `twitterArticle`，有时根本没有 `data-testid`。单一选择器极易命中 `null`

#### 尝试二：基于图片数量判断滚动到底
* **做法**：滚动前后对比 `document.querySelectorAll('img').length`，数量不变则认为到底
* **失败根源**：长文中有大量纯文本段落不含图片，图片数不变≠到底，导致滚动提前终止、内容截断

#### 尝试三：基于 `<h1>` 标签锚点向上爬 DOM 树
* **做法**：找到 `<h1>` 作为标题锚点，向上查找父容器
* **失败根源**：X 使用 React Native for Web，将所有 HTML 元素渲染为 `<div>`。视觉上的大标题实际是 `<div style="font-size: 28px; font-weight: bold">`，根本不是 `<h1>`。`document.querySelectorAll('h1')` 返回 0 个元素

### 最终解决方案
借鉴开源项目 [x2markdown](https://github.com/RuochenLyu/x2markdown) 后发现：X 的长文排版引擎底层保留了 `.longform-*` 语义化 CSS 类名（如 `.longform-header-one`、`.longform-unstyled`、`.longform-blockquote`）。使用 `querySelectorAll` 扁平化提取这些类节点，完美解决。

### 通用经验总结
1. **永远警惕离线 DOM 的浏览器 API 陷阱**：`innerText` 依赖 CSS 渲染引擎，离线节点返回空串。用 `textContent` + `trim()` 替代
2. **不要盲目信任 `data-testid`**：现代 React 应用的 `data-testid` 经常变动或缺失，不能作为唯一依赖
3. **扁平化提取 (Flat Querying) 优于递归遍历 (Tree Walking)**：`querySelectorAll` 保证文档流顺序，一次性压平提取比手写递归可靠 100 倍
4. **滚动到底的判断必须基于物理坐标**：用 `scrollTop` 差值而非 DOM 元素数量来判断是否触底
5. **遇到逆向瓶颈时先查开源实现**：GitHub 上往往有人已经把选择器趟平了，不要自己死磕

---

## Bug #2：推文中的视频无法被提取

### 问题背景
用户导出一条含视频的推文后，下载的 Markdown 文件中完全没有视频相关信息，视频被"静默忽略"了。

### 问题诊断

#### 原因 1：代码层面完全没有视频提取逻辑
- `tweetExtractor.js` 中 `extractImages()` 只选择了 `[data-testid="tweetPhoto"] img`
- 没有任何针对 `[data-testid="videoPlayer"]`、`<video>` 标签或视频封面的处理代码
- 视频不是图片，自然不会被图片提取器捕获

#### 原因 2：推特视频使用 HLS Blob 流，无法直接从 DOM 抓链接
- 通过 DevTools 实验确认：DOM 中甚至**找不到 `<video>` 标签**
- 推特使用 HLS (HTTP Live Streaming) 协议，视频被切成 `.ts` 碎片通过 `.m3u8` 播放列表动态拼接
- 在前端通过 `loaders.video.PlayerHls1` (HLS.js) 播放为 `blob:` 格式流媒体
- `blob:` URL 只在当前页面会话有效，无法持久化

#### 原因 3：真实 mp4 地址藏在 GraphQL API 中
- 通过 Network 面板抓包，确认 `TweetDetail` 和 `TweetResultByRestId` 两个 GraphQL API 的 JSON 响应中包含了完整的各清晰度 mp4 直链
- URL 模式为 `https://video.twimg.com/amplify_video/{ID}/vid/avc1/0/0/{分辨率}/{文件名}.mp4`
- 直链有 CORS 限制 (`Access-Control-Allow-Origin: https://x.com`)，Content Script 无法直接 fetch

### 技术决策
- **技术路线**：通过 `manifest.json` 使用 `"world": "MAIN"` 注入 `videoInterceptor.js`，劫持 `XMLHttpRequest.prototype.open/send`
- **跨 world 通信**：`CustomEvent` 在 MV3 的 isolated 和 main world 之间传递复杂对象（detail）不可靠，最终采用 `window.postMessage` + **隐藏 DOM 元素 (`dataset`) 作为数据桥梁** 的双重架构保证数据同步。

### 通用经验总结
1. **Chrome MV3 限制**：`webRequest` API 只能监听 URL 和 Header，无法直接读取响应体。需要用替代方案（即 monkey-patch XHR 注入到 MAIN world）。
2. **不要在 DNS 层面猜测视频技术方案**：直觉可能是"推特视频用 blob 就没办法了"，但实际 API 层面是完全开放的视频变体列表。
3. **MV3 跨 World 通信陷阱**：不要信任 `CustomEvent.detail` 来跨界传递对象，很容易变成 `null`。老老实实序列化到 DOM `dataset` 或使用 `postMessage` 字符串化传输。

---

## Bug #3：提取器提取到了错误的推文（抓到了评论）

### 问题背景
在成功实现视频拦截后，导出长 Thread 或单个带视频的推文时，发现导出的 Markdown 正文、作者、视频全部错位，甚至变成了下方的某条随机评论。

### 问题诊断
- 检查拦截器数据：缓存的 tweetId 完全正常。
- 只有在调用 `pageExpander` 向下滚动以展开加载内容后，才会发生这个问题。
- **根本原因**：Twitter 使用了 **React 虚拟滚动 (Virtual Scrolling)** 机制。当页面向下滚动，主推文被顶出屏幕视口后，Twitter 会将其**从 DOM 树中安全卸载 (Unmount)**。当提取器运行 `querySelectorAll('article')` 时，剩下的第一个元素自然就变成了屏幕内的一条评论。

### 最终解决方案
在 `pageExpander.js` 中全局防范虚拟滚动：在任何类型的页面展开（包含 `expandThread`）结束时的 `finally` 块中，**强制执行 `window.scrollTo({ top: 0, behavior: 'auto' })` 回滚到最顶部**。
并且在提取开始前 `await sleep(3000)` 等待 Twitter 的 React 框架将顶端推文重新挂载回 DOM 树。

---

## Bug #4：长文提取出现“每句话都重复一次”且“配图/代码不全”

### 问题背景
在长文 (Article) 提取功能上线后，发现导出的 Markdown 文件中，所有的段落、标题都出现了精确的重复（连说两遍）。同时，原本文章中应该有配置代码示例、目录树截图的地方却不翼而飞。

### 问题诊断
#### 原因 1：渲染引擎的嵌套陷阱（导致重复）
为了防爆裂，提取器使用了扁平化提取策略。原本的 CSS 选择器包含了 `.longform-*` 以及 `.public-DraftStyleDefault-block`。
**根本原因**：在 X 的真实 DOM 中，所有的 `.longform-*` 内部都会嵌套一个包含 `.public-DraftStyleDefault-block` 的子 div。`querySelectorAll` 会把父节点和子节点都抓出来，两者的文本一致，导致同一段话被渲染了两次。

#### 原因 2：非标准内容游离于长文专属类名之外（导致缺漏）
我们的扁平化抓网只捕获 `.longform-*`。但是原作者插入的代码块或截图没有这些类名！
截图的直接外层没有特殊标识，代码块则是 `[data-testid="markdown-code-block"]`，导致它们完全没进遍历池。

### 最终解决方案
1. **防止嵌套暴击 (Descendant Filter)**：在 `querySelectorAll` 捞出所有粗筛节点后，使用 `filter` 进行强力去重：“如果节点 A 包含节点 B，则无情剔除底层节点 B，只保留外层结构”。彻底掐死任何嵌套造成的双重提取。
2. **扩大捕获网**：在选取字符串中硬编码加入 `[data-testid="markdown-code-block"]` 和 `img[src*="pbs.twimg.com"]`，然后在主遍历循环中增设专门的分支判定。

---

## 经验法则速查表

| 场景 | ❌ 错误做法 | ✅ 正确做法 |
|------|-----------|-----------|
| 提取离线 DOM 文本 | `cloneNode` 后用 `innerText` | 直接读原始 DOM，或用 `textContent` |
| 定位动态容器 | 硬编码单个 `data-testid` | 多级 fallback 选择器 + 扁平化查询 |
| SPA/虚拟滚动页面提取 | 滚到底部直接开始提取 | **必须滚回顶部 `scrollTo(0,0)` 并等待元素重现** |
| 跨 world 通信 (MV3) | 使用 `CustomEvent.detail` 传对象 | 使用 `window.postMessage` 或 DOM `dataset` |
| 提取视频链接 | 从 DOM 找 `<video src>` | 拦截 GraphQL API 响应的 JSON |
| 匹配推特 API | 硬编码 URL 含哈希 | 用操作名模糊匹配 |
