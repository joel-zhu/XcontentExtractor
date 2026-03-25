/**
 * XcontentExtractor — 单条推文提取器
 */

window.XCE = window.XCE || {};

/**
 * 提取单条推文的完整内容
 */
window.XCE.extractTweet = function () {
  const SELECTORS = window.XCE.SELECTORS;
  const tweetElements = document.querySelectorAll(SELECTORS.tweet);
  if (tweetElements.length === 0) return null;

  const mainTweet = tweetElements[0];
  const model = window.XCE.createDocumentModel();
  model.pageType = 'tweet_detail';
  model.url = location.href;

  // 作者
  model.author = window.XCE.extractAuthorInfo(mainTweet);

  // 时间
  model.publishedAt = window.XCE.extractTimestamp(mainTweet);

  // 正文
  const tweetTextEl = mainTweet.querySelector(SELECTORS.tweetText);
  const text = window.XCE.normalizeText(tweetTextEl);

  // 标题
  model.title = text.substring(0, 60).replace(/\n/g, ' ').trim();
  if (text.length > 60) model.title += '…';

  if (text) {
    model.blocks.push(window.XCE.createBlock('paragraph', text));
  }

  // 图片
  const images = window.XCE.extractImages(mainTweet);
  for (const img of images) {
    model.blocks.push(
      window.XCE.createBlock('image', '', { url: img.url, alt: img.alt })
    );
    model.media.push(img);
  }

  // 视频
  const videos = window.XCE.extractVideos(mainTweet);
  for (const video of videos) {
    model.blocks.push(
      window.XCE.createBlock('video', '', { url: video.url })
    );
    model.media.push(video);
  }

  // 引用推文
  const quote = window.XCE.extractQuoteTweet(mainTweet);
  if (quote) model.blocks.push(quote);

  // 链接
  const links = window.XCE.extractLinks(tweetTextEl);
  for (const link of links) {
    model.blocks.push(window.XCE.createBlock('link', link.text, { url: link.url }));
  }

  // hashtag & mentions
  model.hashtags = window.XCE.extractHashtags(tweetTextEl);
  model.mentions = window.XCE.extractMentions(tweetTextEl);

  return model;
};

/**
 * 提取作者信息
 */
window.XCE.extractAuthorInfo = function (tweetElement) {
  const SELECTORS = window.XCE.SELECTORS;
  const userNameEl = tweetElement.querySelector(SELECTORS.userName);
  if (!userNameEl) return window.XCE.createAuthor();

  let displayName = '';
  let username = '';
  let profileUrl = '';

  const links = userNameEl.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href && href.match(/^\/[^/]+$/)) {
      username = href.replace('/', '');
      profileUrl = `https://x.com${href}`;

      const nameSpans = link.querySelectorAll('span');
      for (const span of nameSpans) {
        const spanText = span.textContent.trim();
        if (spanText && !spanText.startsWith('@')) {
          displayName = spanText;
          break;
        }
      }
      break;
    }
  }

  if (!username) {
    const allText = userNameEl.textContent;
    const match = allText.match(/@(\w+)/);
    if (match) {
      username = match[1];
      profileUrl = `https://x.com/${username}`;
    }
  }

  return window.XCE.createAuthor(displayName, username, profileUrl);
};

/**
 * 提取时间戳
 */
window.XCE.extractTimestamp = function (tweetElement) {
  const timeEl = tweetElement.querySelector(window.XCE.SELECTORS.timeElement);
  return timeEl ? (timeEl.getAttribute('datetime') || '') : '';
};

/**
 * 提取图片 URL
 */
window.XCE.extractImages = function (tweetElement) {
  const images = [];
  const imgElements = tweetElement.querySelectorAll(window.XCE.SELECTORS.tweetPhoto);

  for (const img of imgElements) {
    const src = img.getAttribute('src');
    if (src && !src.includes('emoji') && !src.includes('profile')) {
      let highQualityUrl = src;
      if (highQualityUrl.includes('name=')) {
        highQualityUrl = highQualityUrl.replace(/name=\w+/, 'name=large');
      }
      images.push({
        url: highQualityUrl,
        alt: img.getAttribute('alt') || 'Image',
      });
    }
  }

  return images;
};

/**
 * 提取引用推文
 */
window.XCE.extractQuoteTweet = function (tweetElement) {
  const SELECTORS = window.XCE.SELECTORS;
  const quoteEl = tweetElement.querySelector(SELECTORS.quoteTweet);
  if (!quoteEl) return null;

  const quoteUserEl = quoteEl.querySelector(SELECTORS.userName);
  let quoteAuthor = '';
  if (quoteUserEl) {
    const match = quoteUserEl.textContent.match(/@(\w+)/);
    quoteAuthor = match ? `@${match[1]}` : '';
  }

  const quoteTextEl = quoteEl.querySelector(SELECTORS.tweetText);
  const quoteText = window.XCE.normalizeText(quoteTextEl);

  if (quoteText) {
    return window.XCE.createBlock('quote', quoteText, {
      meta: { author: quoteAuthor },
    });
  }

  return null;
};

/**
 * 提取视频（从拦截的缓存中根据 tweetId 获取）
 *
 * tweetId 提取策略（按优先级）：
 * 1. 推文内 time[datetime] 元素的父 <a> 链接（最可靠，指向推文自身）
 * 2. 当前页面 URL 中的 status ID（单条推文详情页兜底）
 */
window.XCE.extractVideos = function (tweetElement) {
  // 1. 获取 tweetId — 优先使用时间戳链接（它总是指向推文自身，不会指向评论）
  let tweetId = '';
  const timeEl = tweetElement.querySelector('time[datetime]');
  if (timeEl) {
    const linkEl = timeEl.closest('a[href*="/status/"]');
    if (linkEl) {
      const match = linkEl.getAttribute('href').match(/\/status\/(\d+)/);
      if (match) tweetId = match[1];
    }
  }

  // 2. 兜底：从当前页面 URL 获取
  if (!tweetId) {
    const urlMatch = location.href.match(/\/status\/(\d+)/);
    if (urlMatch) tweetId = urlMatch[1];
  }

  if (!tweetId) return [];

  // 3. 先查 postMessage 同步过来的缓存
  let videoCache = window.XCE._videoCache || {};

  // 4. 如果缓存为空，尝试从 DOM bridge 同步读取（应对 postMessage 时序问题）
  if (!videoCache[tweetId]) {
    const bridge = document.getElementById('__xce_video_bridge__');
    if (bridge && bridge.dataset.videoData) {
      try {
        videoCache = JSON.parse(bridge.dataset.videoData);
        // 同时更新缓存，避免重复读取
        Object.assign(window.XCE._videoCache, videoCache);
      } catch (e) {
        console.warn('[XCE] DOM bridge 数据解析失败:', e);
      }
    }
  }

  if (videoCache[tweetId]) {
    console.log(`[XCE] 匹配到视频，tweetId: ${tweetId}，共 ${videoCache[tweetId].length} 个`);
    return videoCache[tweetId];
  }

  return [];
};
