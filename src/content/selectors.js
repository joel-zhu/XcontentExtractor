/**
 * XcontentExtractor — 集中管理所有 DOM 选择器
 *
 * 优先级：data-testid > 语义化标签 > 结构位置 > CSS 类名
 * X 页面变化时只需更新此文件。
 */

window.XCE = window.XCE || {};

window.XCE.SELECTORS = {
  // === 推文容器 ===
  tweet: 'article[data-testid="tweet"]',
  primaryColumn: '[data-testid="primaryColumn"]',

  // === 推文内容 ===
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  tweetPhoto: '[data-testid="tweetPhoto"] img',

  // === 语义化标签 ===
  timeElement: 'time[datetime]',
  articleElement: 'article',
  linkElement: 'a[href]',

  // === 交互元素 ===
  showMoreButton: '[data-testid="tweet-text-show-more-link"]',
  showMoreButtonAlt: '[role="button"][tabindex="0"]',

  // === 引用推文 ===
  quoteTweet: '[data-testid="quoteTweet"]',

  // === 用户头像 ===
  userAvatar: '[data-testid="Tweet-User-Avatar"]',

  // === 卡片/链接预览 ===
  card: '[data-testid="card.wrapper"]',

  // === X Article (长文) 相关 ===
  noteComponent: '[data-testid="noteComponent"]',
  focusModeButton: 'a[aria-label="专注模式"], a[aria-label="Focus mode"]',
  articleHeadingLabel: 'h2',
  articleReadView: '[data-testid="twitterArticleReadView"], [data-testid="twitterArticle"], [data-testid="noteComponent"]',
  articleTitle: '[data-testid="twitter-article-title"], h1.longform-header-one, h1',
  articleRichText: '[data-testid="twitterArticleRichTextView"], [data-testid="longformRichTextComponent"]',
  
  // 基于类的长文块选择器 (逗号分隔)
  articleBlocks: [
    '.longform-header-one', '.longform-header-one-narrow',
    '.longform-header-two', '.longform-header-two-narrow',
    '.longform-unstyled', '.longform-unstyled-narrow',
    '.longform-blockquote', '.longform-blockquote-narrow',
    '.longform-unordered-list-item', '.longform-unordered-list-item-narrow',
    '.longform-ordered-list-item', '.longform-ordered-list-item-narrow',
    '[data-testid="markdown-code-block"]',
    'img[src*="pbs.twimg.com/media"]'
  ].join(', '),
};

/**
 * 调试工具：检查所有选择器在当前页面的命中情况
 */
window.XCE.checkSelectors = function () {
  const results = {};
  for (const [name, selector] of Object.entries(window.XCE.SELECTORS)) {
    results[name] = {
      found: document.querySelectorAll(selector).length,
      selector: selector,
    };
  }
  console.table(results);
  return results;
};
