# XcontentExtractor

[English](./README_EN.md) | [中文](./README.md)

Export tweets, threads, and articles from X (Twitter) into beautifully formatted Markdown files with one click.

## ✨ Features

| Content Type | Status | Description |
|----------|----------|------|
| Single Tweet | ✅ Done | Extract text, images, videos, quote tweets, links, hashtags, mentions |
| Threads | ✅ Done | Automatically identify and extract consecutive tweets by the same author, merging them into one document |
| Articles | ✅ Done | Automatically enter focus mode, scroll to load full text, extract titles/text/images/lists/quotes |
| Video Extraction | ✅ Done | Intercept GraphQL APIs to get high-definition mp4 video direct links |

---

## 🏗️ Tech Stack

- **Platform**: Chrome Extension (Manifest V3)
- **Language**: Pure JavaScript (No framework dependencies, no build tools)
- **Permissions**: `activeTab`, `downloads`, `storage`
- **Compatible Domains**: `x.com`, `twitter.com`

---

## 📁 Project Structure

```
XcontentExtractor/
├── manifest.json                         # MV3 Extension Manifest
├── icons/                                # Extension Icons (16/48/128px)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   └── index.js                      # Service Worker Background Script
│   │                                     # Handles download requests & message forwarding
│   ├── content/
│   │   ├── index.js                      # Content Script Main Entry
│   │   │                                 # Page detection → expand → extract → render → download
│   │   ├── selectors.js                  # Centralized DOM Selectors
│   │   │                                 # Includes data-testid & .longform-* classes
│   │   ├── normalize.js                  # Text Normalization Utility
│   │   │                                 # Handles newlines, whitespaces, special chars
│   │   ├── pageDetector.js               # Page Type Detector
│   │   │                                 # Detects tweet_detail / thread / article
│   │   ├── pageExpander.js               # Page Auto-Expander
│   │   │                                 # Auto-scrolls, clicks article focus mode
│   │   └── extractors/
│   │       ├── tweetExtractor.js         # Single Tweet Extractor
│   │       │                             # Extracts text, author, time, images, quote tweets, links
│   │       ├── threadExtractor.js        # Thread Extractor
│   │       │                             # Collects consecutive tweets by the same author
│   │       └── articleExtractor.js       # Article Extractor
│   │                                     # Uses .longform-* flat extraction strategy
│   ├── popup/
│   │   ├── popup.html                    # Popup UI Structure
│   │   ├── popup.css                     # Popup Styles
│   │   └── popup.js                      # Popup Logic
│   │                                     # Shows page type, status, triggers export
│   └── shared/
│       ├── types.js                      # Shared Data Models
│       │                                 # DocumentModel, Author, Block structures
│       └── markdownRenderer.js           # Markdown Renderer
│                                         # Converts DocumentModel to .md text
```

---

## 🔧 Installation & Usage

### Installation
1. Clone or download this project to your local machine.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the root directory of this project.
5. After successful installation, the XcontentExtractor icon will appear in your toolbar.

### Usage
1. Open a tweet, thread, or article on X (Twitter).
2. Click the XcontentExtractor icon in your browser toolbar.
3. The popup will display the detected page type (e.g., "Tweet Detail", "Thread", "X Article").
4. Click the **"Export Markdown"** button.
5. The extension will automatically expand all content (including lazy-loaded content and article focus mode), then generate and download the `.md` file.

### Development & Debugging
- After modifying the code, go to the `chrome://extensions/` page and click the 🔄 refresh button on the extension card.
- Press F12 on the X page to open DevTools, and check the Console for debug logs starting with `[XCE]` or `[XCE-Article]`.
- Run `window.XCE.checkSelectors()` in the Console to see matching status for all selectors.

---

## 🧱 Core Architecture

### Data Flow

```
User clicks Export button
    │
    ▼
popup.js ──Message──▶ content/index.js (handleExport)
                        │
                        ├── 1. pageDetector.js → Detect page type
                        ├── 2. pageExpander.js → Auto-expand content
                        ├── 3. extractors/*    → Extract structured data (DocumentModel)
                        ├── 4. markdownRenderer.js → Render to Markdown text
                        └── 5. Send message to background/index.js → Trigger file download
```

### DocumentModel Data Structure

All extractors output a unified `DocumentModel` object:

```javascript
{
  title: 'Tweet title or first 60 chars',
  author: { name: 'Display Name', username: 'handle', profileUrl: '...' },
  publishedAt: '2026-03-23T12:00:00.000Z',
  sourceUrl: 'https://x.com/user/status/123',
  type: 'tweet_detail' | 'thread' | 'article',
  blocks: [
    { type: 'paragraph', content: 'Main text content' },
    { type: 'heading', level: 2, content: 'Title' },
    { type: 'image', url: 'https://pbs.twimg.com/...', alt: 'Image description' },
    { type: 'quote', content: 'Quoted text' },
    { type: 'list', ordered: false, items: ['Item 1', 'Item 2'] },
    { type: 'code', content: 'Code block content' },
    { type: 'link', url: '...', content: 'Link text' },
    { type: 'video', url: 'https://video.twimg.com/...' },
  ],
  media: [],
  hashtags: [],
  mentions: [],
}
```

### Selector Management Strategy

All DOM selectors are centralized in `src/content/selectors.js`. When X updates its frontend DOM structure, only this file needs to be modified. Selection priority follows:

```
data-testid > Semantic tags > Structural position > CSS class names
```

For articles, it additionally relies on the underlying `.longform-*` series of CSS class names for a flattened extraction strategy.

---

## 📝 Markdown Output Format Example

### Single Tweet
```markdown
# Tweet Title (First 60 chars of text)

---
- Author: DisplayName (@username)
- Published: 2026-03-23T12:00:00.000Z
- Source: https://x.com/user/status/123
- Type: Tweet
---

Main content...

![Image](https://pbs.twimg.com/media/xxx?format=jpg&name=large)
```

### Article
```markdown
# What You Didn't Know About Claude Code: Architecture, Governance, and Engineering Practices

---
- Author: Tw93 (@HiTw93)
- Published: 2026-03-12T...
- Source: https://x.com/HiTw93/article/...
- Type: Article
---

## 0. TL;DR

Today's article stems from deep usage of Claude Code over the past half year...

## 1. Overall Architecture

...
```

---

## ⚠️ Known Limitations

1. **Requires Login**: The extension relies on an authenticated X session to access tweet content.
2. **SPA Routing**: X uses SPA routing; page type detection relies on URL change event listeners.
3. **Selector Lifespan**: X's DOM structure may change with frontend updates, requiring periodic maintenance of `selectors.js`.

---

## 🙏 Acknowledgements

- [x2markdown](https://github.com/RuochenLyu/x2markdown) — Open source project that provided crucial insights into the `.longform-*` selectors for our article extraction.
