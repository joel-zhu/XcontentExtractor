/**
 * XcontentExtractor — 页面类型检测
 */

window.XCE = window.XCE || {};

/**
 * 检测当前页面类型
 * @returns {'tweet_detail' | 'thread' | 'article' | 'unsupported'}
 */
window.XCE.detectPageType = function () {
  const url = location.href;
  const SELECTORS = window.XCE.SELECTORS;

  // URL 中包含 /article/ 的直接判定为长文
  if (url.match(/https?:\/\/(x\.com|twitter\.com)\/.*\/article\//)) {
    return 'article';
  }

  const statusMatch = url.match(
    /https?:\/\/(x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)/
  );
  if (!statusMatch) return 'unsupported';

  // === Article 检测（优先于 tweet/thread） ===
  // X Article (长文) 的 DOM 特征：
  // 1. 存在 data-testid="noteComponent"
  // 2. 存在"专注模式"按钮
  // 3. 页面中有 h2 包含文字"文章"或"Article"
  if (document.querySelector(SELECTORS.noteComponent)) {
    return 'article';
  }
  if (document.querySelector(SELECTORS.focusModeButton)) {
    return 'article';
  }
  // 检查 h2 标签是否包含"文章"或"Article"
  const h2Elements = document.querySelectorAll(SELECTORS.articleHeadingLabel);
  for (const h2 of h2Elements) {
    const text = h2.textContent.trim();
    if (text === '文章' || text === 'Article') {
      return 'article';
    }
  }

  const tweets = document.querySelectorAll(SELECTORS.tweet);
  if (tweets.length === 0) return 'unsupported';

  const mainAuthor = window.XCE.getAuthorFromTweet(tweets[0]);
  if (!mainAuthor) return 'tweet_detail';

  let sameAuthorCount = 1;
  for (let i = 1; i < tweets.length; i++) {
    const author = window.XCE.getAuthorFromTweet(tweets[i]);
    if (author === mainAuthor) {
      sameAuthorCount++;
    } else {
      break;
    }
  }

  return sameAuthorCount > 1 ? 'thread' : 'tweet_detail';
};

/**
 * 从推文 article 节点中提取作者用户名
 */
window.XCE.getAuthorFromTweet = function (tweetElement) {
  const SELECTORS = window.XCE.SELECTORS;

  const userNameEl = tweetElement.querySelector(SELECTORS.userName);
  if (userNameEl) {
    const links = userNameEl.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.match(/^\/[^/]+$/)) {
        return href.replace('/', '');
      }
    }
  }

  const timeLink = tweetElement.querySelector('a[href*="/status/"]');
  if (timeLink) {
    const match = timeLink.getAttribute('href').match(/^\/([^/]+)\/status/);
    if (match) return match[1];
  }

  return null;
};
