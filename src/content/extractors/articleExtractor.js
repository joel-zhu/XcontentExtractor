/**
 * XcontentExtractor — 长文 (Article) 提取器
 *
 * 策略：借鉴 x2markdown，使用 X 原生的长文专属类名 (`.longform-*`) 
 * 进行扁平化 querySelectorAll() 提取，彻底抛弃不稳定的 DOM 递归。
 */

window.XCE = window.XCE || {};

window.XCE.extractArticle = function () {
  console.log('[XCE-Article] 基于 x2markdown 策略开始提取长文...');
  const SELECTORS = window.XCE.SELECTORS;

  // 1. 寻找根节点
  const root = document.querySelector(SELECTORS.articleReadView);
  if (!root) {
    console.warn('[XCE-Article] 未找到长文根节点 twitterArticleReadView');
    return null;
  }

  const documentModel = {
    title: '',
    author: {},
    publishedAt: null,
    sourceUrl: location.href,
    type: 'article',
    blocks: [],
    media: [],
    hashtags: [],
    mentions: [],
  };

  // 2. 提取标题
  const titleEl = root.querySelector(SELECTORS.articleTitle);
  if (titleEl) {
    documentModel.title = (titleEl.innerText || titleEl.textContent || '').trim();
  }

  // 3. 提取作者和时间
  extractAuthorInfo(documentModel);
  const timeEl = root.querySelector('time[datetime]') || document.querySelector('time[datetime]');
  if (timeEl) {
    documentModel.publishedAt = timeEl.getAttribute('datetime');
  }

  // 4. 定位正文富文本区
  const richTextRoot = root.querySelector(SELECTORS.articleRichText) || root;

  // 5. 提取顶层独立图片 (封面图等可能不在富文本区内)
  const allImages = Array.from(root.querySelectorAll('img[src]'));
  const headerImages = allImages.filter(img => !richTextRoot.contains(img));
  for (const img of headerImages) {
    processImage(img, documentModel.blocks);
  }

  // 6. 扁平化提取富文本正文
  // querySelectorAll 保证了 DOM 在页面里的自然顺序！
  const rawNodes = Array.from(richTextRoot.querySelectorAll(SELECTORS.articleBlocks));
  // 防止重复：排除那些作为其他被捕获节点子节点的冗余节点
  const contentNodes = rawNodes.filter((node, index, list) => {
    return !list.some((other, otherIndex) => otherIndex !== index && other.contains(node));
  });
  console.log(`[XCE-Article] 找到了 ${contentNodes.length} 个标准内容块 (去重前 ${rawNodes.length})`);

  for (const node of contentNodes) {
    // 过滤隐藏节点
    try {
      if (window.getComputedStyle(node).display === 'none') continue;
    } catch (e) {}

    // 如果该顶层节点本身即是一张独立图片
    if (node.tagName === 'IMG') {
      processImage(node, documentModel.blocks);
      continue;
    }

    // 顺便处理块内部包含的图片
    const inlineImgs = node.querySelectorAll('img[src]');
    for (const img of inlineImgs) {
      processImage(img, documentModel.blocks);
    }

    const text = (node.innerText || node.textContent || '').trim();
    if (!text) continue;

    // 根据类名判断类型
    if (node.matches('[data-testid="markdown-code-block"]')) {
      documentModel.blocks.push({ type: 'code', content: text });
    } else if (node.matches('.longform-header-one, .longform-header-one-narrow')) {
      documentModel.blocks.push({ type: 'heading', level: 2, content: text });
    } else if (node.matches('.longform-header-two, .longform-header-two-narrow')) {
      documentModel.blocks.push({ type: 'heading', level: 3, content: text });
    } else if (node.matches('.longform-blockquote, .longform-blockquote-narrow')) {
      documentModel.blocks.push({ type: 'quote', content: text });
    } else if (node.matches('.longform-unordered-list-item, .longform-unordered-list-item-narrow')) {
      // 合并连续的列表项
      const lastBlock = documentModel.blocks[documentModel.blocks.length - 1];
      if (lastBlock && lastBlock.type === 'list' && !lastBlock.ordered) {
        lastBlock.items.push(text);
      } else {
        documentModel.blocks.push({ type: 'list', ordered: false, items: [text] });
      }
    } else if (node.matches('.longform-ordered-list-item, .longform-ordered-list-item-narrow')) {
      const lastBlock = documentModel.blocks[documentModel.blocks.length - 1];
      if (lastBlock && lastBlock.type === 'list' && lastBlock.ordered) {
        lastBlock.items.push(text);
      } else {
        documentModel.blocks.push({ type: 'list', ordered: true, items: [text] });
      }
    } else {
      // 默认视作普通段落 (.longform-unstyled)
      // 如果和标题重复（极少数情况 titleEl 嵌在 richText 内），则跳过
      if (text === documentModel.title && documentModel.blocks.length === 0) continue;
      documentModel.blocks.push({ type: 'paragraph', content: text });
    }
  }

  // 如果标准块提取不到（可能不是标准的 article），启用文本后备提取
  if (documentModel.blocks.length === 0) {
    console.warn('[XCE-Article] 标准类名提取失败，尝试按常规标签兜底提取...');
    const fallbackSelectors = 'p, h2, h3, h4, blockquote, li, pre, div[dir="auto"]';
    const fallbackNodes = Array.from(richTextRoot.querySelectorAll(fallbackSelectors));
    for (const node of fallbackNodes) {
      const text = (node.innerText || node.textContent || '').trim();
      if (text && text.length > 2 && text !== documentModel.title) {
        // 简单去重
        if (!documentModel.blocks.some(b => b.content === text)) {
           documentModel.blocks.push({ type: 'paragraph', content: text });
        }
      }
    }
  }

  console.log('[XCE-Article] 提取完成，最终 Blocks:', documentModel.blocks.length);
  return documentModel;
};

function processImage(img, blocks) {
  let src = img.src || img.getAttribute('src') || '';
  // 忽略头像、表情、装饰图
  if (!src || src.includes('emoji') || src.includes('profile_images') || src.includes('semantic_core')) return;
  if (!src.includes('pbs.twimg.com/media')) return;

  if (src.includes('name=')) {
    src = src.replace(/name=\w+/, 'name=large');
  }

  // 去重
  if (!blocks.find(b => b.type === 'image' && b.url === src)) {
    blocks.push({
      type: 'image',
      url: src,
      alt: img.alt || '长文配图',
    });
  }
}

function extractAuthorInfo(model) {
  const userNameEl = document.querySelector(window.XCE.SELECTORS.userName);
  if (userNameEl) {
    const nameStr = (userNameEl.innerText || userNameEl.textContent || '').split('\n');
    model.author = {
      name: nameStr[0] || 'Unknown',
      username: nameStr[1] ? nameStr[1].replace('@', '') : 'unknown',
      profileUrl: '',
    };
    const profileLink = userNameEl.querySelector('a[href]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      if (href && href.match(/^\/[^/]+$/)) {
        model.author.profileUrl = 'https://x.com' + href;
        model.author.username = href.replace('/', '');
      }
    }
  }
}
