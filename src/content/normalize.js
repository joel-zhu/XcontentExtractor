/**
 * XcontentExtractor — DOM 清洗与规范化
 */

window.XCE = window.XCE || {};

const NOISE_SELECTORS = [
  '[role="group"]',
  '[data-testid="caret"]',
  '[data-testid="tweet-action-bar"]',
  '[data-testid="app-text-transition-container"]',
  '[data-testid="analyticsButton"]',
  '[data-testid="placementTracking"]',
];

/**
 * 清洗推文 DOM 节点
 */
window.XCE.cleanTweetDom = function (tweetElement) {
  const clone = tweetElement.cloneNode(true);
  for (const selector of NOISE_SELECTORS) {
    const noiseNodes = clone.querySelectorAll(selector);
    noiseNodes.forEach((node) => node.remove());
  }
  return clone;
};

/**
 * 规范化推文文本
 */
window.XCE.normalizeText = function (textElement) {
  if (!textElement) return '';

  const clone = textElement.cloneNode(true);

  // emoji 图片 → alt 文本
  const emojiImgs = clone.querySelectorAll('img[src*="emoji"]');
  emojiImgs.forEach((img) => {
    const alt = img.getAttribute('alt') || '';
    img.replaceWith(document.createTextNode(alt));
  });

  // <br> → 换行符
  const brs = clone.querySelectorAll('br');
  brs.forEach((br) => br.replaceWith(document.createTextNode('\n')));

  // 隐藏的 aria span
  const hiddenSpans = clone.querySelectorAll('span[aria-hidden="true"]');
  hiddenSpans.forEach((span) => span.remove());

  let text = clone.textContent || '';
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
};

/**
 * 从推文文本中提取链接
 */
window.XCE.extractLinks = function (textElement) {
  if (!textElement) return [];

  const links = [];
  const anchors = textElement.querySelectorAll('a[href]');

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    const text = anchor.textContent.trim();

    if (href.startsWith('/') && !href.includes('status')) {
      continue;
    }

    if (href.includes('t.co') && text) {
      links.push({ text, url: href });
    } else if (href.startsWith('http')) {
      links.push({ text: text || href, url: href });
    }
  }

  return links;
};

/**
 * 提取 hashtag
 */
window.XCE.extractHashtags = function (textElement) {
  if (!textElement) return [];
  const tags = [];
  const anchors = textElement.querySelectorAll('a[href*="/hashtag/"]');
  for (const anchor of anchors) {
    const tag = anchor.textContent.trim();
    if (tag) tags.push(tag);
  }
  return tags;
};

/**
 * 提取 @提及
 */
window.XCE.extractMentions = function (textElement) {
  if (!textElement) return [];
  const mentions = [];
  const anchors = textElement.querySelectorAll('a[href]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (href && href.match(/^\/[A-Za-z0-9_]+$/) && anchor.textContent.startsWith('@')) {
      mentions.push(anchor.textContent.trim());
    }
  }
  return mentions;
};
