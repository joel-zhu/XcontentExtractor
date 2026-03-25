# 交接摘要：XcontentExtractor — 视频提取功能

## 1. 当前任务目标

为 XcontentExtractor Chrome 扩展**新增视频链接提取功能**。当用户导出一条包含视频的推文时，导出的 Markdown 文件中应包含该视频的直链（mp4 格式），而非忽略视频。

**预期产出**：用户点击"导出 Markdown"后，如果推文包含视频，Markdown 中应出现类似 `[📹 视频](https://video.twimg.com/.../720x1280/xxx.mp4)` 的链接。

**完成标准**：
- 单条带视频的推文能正确提取视频 mp4 链接
- Thread 中带视频的推文也能正确处理
- 不影响现有图片、文本、长文提取逻辑

---

## 2. 当前进展

**已完成的分析和确认（全部经过实际抓包验证）**：

- ✅ 确认推文视频在 DOM 中**没有直接的 `<video>` 标签**可供提取
- ✅ 确认推特使用 HLS 流媒体协议播放视频（有 8 个 `.m3u8` 请求被抓到）
- ✅ 确认网络层存在真实的 `.mp4` 分片请求（`https://video.twimg.com/amplify_video/{ID}/vid/avc1/0/0/{分辨率}/{文件名}.mp4`），但 Content-Length 仅 898 字节，是 fMP4 初始化段而非完整视频
- ✅ 确认推特的 GraphQL API（`TweetDetail` 和 `TweetResultByRestId`）在 JSON 响应中包含完整的视频变体列表（各清晰度的 mp4 直链）
- ✅ 与用户讨论并达成一致：**只在 Markdown 中放视频链接，不尝试下载视频文件本身**

**未开始编码**，本次会话纯粹是在做调研和讨论。

---

## 3. 关键上下文

### 重要背景
- 这是一个 Chrome MV3 扩展，项目根目录：`/Users/chloegreen/Desktop/project/coder/XcontentExtractor`
- 当前已支持三种内容类型的导出：单条推文 (tweet_detail)、Thread (thread)、长文 Article (article)
- 图片提取已有成熟逻辑，在 `src/content/extractors/tweetExtractor.js` 的 `extractImages()` 函数中
- 视频提取是全新功能，代码中**完全没有**任何视频相关的处理逻辑

### 用户明确要求
- 只放视频的 mp4 链接到 Markdown 中，无需下载视频文件
- 不需要封面截图

### 已做出的关键决定
- **技术路线**：通过拦截 GraphQL API 响应来获取视频 mp4 链接（而非解析 m3u8 或拼接 mp4 碎片）
- **呈现方式**：Markdown 中以链接形式呈现视频

### 已知约束
- mp4 直链有 CORS 限制（`Access-Control-Allow-Origin: https://x.com`），前端 Content Script 无法直接 fetch
- 需要在 Background Script 中拦截网络请求

---

## 4. 关键发现

1. **推特视频的真实地址藏在 GraphQL API 响应中**。两个关键 API 端点：
   - `TweetResultByRestId`：URL pattern 为 `https://x.com/i/api/graphql/.../TweetResultByRestId?variables=...`
   - `TweetDetail`：URL pattern 为 `https://x.com/i/api/graphql/.../TweetDetail?variables=...`

2. **JSON 响应中视频数据的预期路径**（需要你实际验证，可能一两个层级有偏差）：
   ```
   data.tweetResult.result.legacy.extended_entities.media[].video_info.variants[]
   ```
   每个 variant 对象形如：
   ```json
   {
     "bitrate": 2176000,
     "content_type": "video/mp4",
     "url": "https://video.twimg.com/ext_tw_video/.../vid/avc1/0/0/1280x720/xxx.mp4"
   }
   ```
   应取 `content_type === "video/mp4"` 且 `bitrate` 最高的那个作为最佳质量链接。

3. **视频 URL 的域名模式**：`https://video.twimg.com/amplify_video/` 或 `https://video.twimg.com/ext_tw_video/`

4. **m3u8 由 `loaders.video.PlayerHls1` 发起**，说明推特使用了 HLS.js 库来做前端视频播放

---

## 5. 未完成事项（按优先级排序）

1. **【核心】在 Background Script 中拦截 GraphQL API 响应，提取视频 mp4 链接**
   - 监听 `TweetDetail` 或 `TweetResultByRestId` 请求
   - 解析 JSON 响应，提取 `video_info.variants` 中 bitrate 最高的 mp4 URL
   - 将提取到的视频链接通过消息传递给 Content Script

2. **【核心】修改 `tweetExtractor.js`，将视频链接加入 blocks**
   - 新增一个 `extractVideos()` 函数或在现有 `extractImages()` 中扩展
   - 在 `documentModel.blocks` 中加入 `{ type: 'video', url: '...' }` 类型的块

3. **【核心】修改 `markdownRenderer.js`，支持渲染 video 类型的 block**
   - 渲染为 `[📹 视频](mp4_url)` 格式

4. **【中等】修改 `manifest.json`，添加 `webRequest` 相关权限**
   - 可能需要 `"permissions": ["webRequest"]` 和对应的 host 权限

5. **【低优】Thread 中的视频处理**
   - `threadExtractor.js` 中也需要同样处理视频

---

## 6. 建议接手路径

### 应优先查看的文件
| 文件 | 原因 |
|------|------|
| `src/content/extractors/tweetExtractor.js` | 现有的提取主入口，需要在这里加视频逻辑 |
| `src/background/background.js` | 后台脚本，需要在这里加网络请求拦截 |
| `src/shared/markdownRenderer.js` | Markdown 渲染器，需要支持 video block |
| `src/content/selectors.js` | 所有 DOM 选择器的集中管理 |
| `manifest.json` | 权限声明，可能需要加 webRequest |

### 先验证什么
1. 打开一条含视频的推文，在 DevTools → Network 中找到 `TweetDetail` 请求，点开「响应」(Response) 面板
2. 用 Ctrl+F 搜索 `video_info` 或 `video/mp4`，确认视频变体数据的**确切 JSON 路径**
3. 这一步至关重要，因为推特的 GraphQL schema 会频繁变化，上面第 4 节中给出的路径是预估的

### 推荐的下一步动作
1. 先在 Background Script 中写一个简单的 `chrome.webRequest.onCompleted` 监听器，只做 `console.log` 打印拦截到的 URL，验证能否成功拦截 GraphQL 请求
2. 确认能拦截后，改用 `chrome.debugger` 或 `fetch` 重新拉取该请求的 JSON 来解析（注意 MV3 中 `webRequest` 无法直接读取响应体，可能需要用其他方式）
3. 拿到视频 URL 后，通过 `chrome.runtime.sendMessage` 传递给 Content Script

---

## 7. 风险与注意事项

### ⚠️ MV3 中无法直接读取请求响应体
Chrome Manifest V3 的 `webRequest` API 只能监听请求的 URL 和 Header，**不能像 MV2 那样用 `webRequestBlocking` 读取响应体**。这意味着你可能需要：
- **方案 A**：在 Content Script 中通过 `XMLHttpRequest` 或 `fetch` 重新请求同一个 GraphQL API（需要携带 cookie 和 csrf token）
- **方案 B**：使用 `chrome.debugger` API 附加到页面来拦截网络响应（权限较重）
- **方案 C**：在 Content Script 中注入一段脚本，用 monkey-patch 劫持 `XMLHttpRequest.prototype.open` 来截获推特自己的 API 调用结果

**方案 C 可能是最轻量的方案**，可以参考 x2markdown 项目（`https://github.com/RuochenLyu/x2markdown`）的做法。

### ❌ 已验证不可行的方向
- 直接从 DOM 中的 `<video>` 标签提取 `src`：DOM 中找不到 `<video>` 标签
- 直接抓取 mp4 分片 URL 拼接完整视频：分片只有初始化段，无法拼出完整视频

### ⚡ 容易踩的坑
- 推特的 GraphQL endpoint URL 中包含一个哈希值（如 `/graphql/zy39CwTyYhU-_0LP7dIjjg/TweetResultByRestId`），这个哈希值会随推特前端版本更新而变化，所以匹配时应该用 URL 中的操作名（`TweetResultByRestId`、`TweetDetail`）做模糊匹配，不要硬编码完整路径
- 视频可能有多种类型：普通视频、GIF 动图（在推特内部也是视频）、直播回放。先只处理普通视频即可

---

## 下一位 Agent 的第一步建议

打开一条含视频的推文（可以用 `testURL.md` 中的链接），在 DevTools Network 面板中找到 `TweetDetail` 的响应 JSON，搜索 `video_info`，**截图或复制出视频数据的完整 JSON 路径**。这是整个功能实现的地基，路径搞错了后面全白费。拿到路径后，先从最简单的 Content Script 注入方案（monkey-patch XHR）开始原型验证。
