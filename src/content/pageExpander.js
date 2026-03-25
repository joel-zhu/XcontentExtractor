/**
 * XcontentExtractor — 页面展开器
 */

window.XCE = window.XCE || {};

const EXPAND_CONFIG = {
  maxScrollRounds: 15,
  maxWaitTime: 12000,
  scrollDelay: 800,
  stableRounds: 3,
  keepAliveInterval: 5000,
};

/**
 * 根据页面类型决定是否需要展开
 */
window.XCE.expandPageIfNeeded = async function (pageType) {
  try {
    if (pageType === 'tweet_detail') {
      await clickShowMoreButtons();
      return { expanded: true, reason: 'single_tweet' };
    }

    if (pageType === 'thread') {
      return await expandThread();
    }

    if (pageType === 'article') {
      return await expandArticle();
    }

    return { expanded: false, reason: 'unsupported' };
  } finally {
    // 全局防范：不管何种页面类型，在展开结束后强制回到顶部，确保主元素可见
    window.scrollTo({ top: 0, behavior: 'auto' });
    await sleep(300);
  }
};

async function expandThread() {
  const SELECTORS = window.XCE.SELECTORS;
  const startTime = Date.now();
  let scrollCount = 0;
  let stableCount = 0;
  let lastBlockCount = countThreadTweets();

  const keepAliveTimer = setInterval(() => {
    try {
      chrome.runtime.sendMessage({ type: 'KEEPALIVE' });
    } catch (e) {}
  }, EXPAND_CONFIG.keepAliveInterval);

  try {
    while (true) {
      if (Date.now() - startTime > EXPAND_CONFIG.maxWaitTime) {
        return { expanded: true, reason: 'timeout' };
      }
      if (scrollCount >= EXPAND_CONFIG.maxScrollRounds) {
        return { expanded: true, reason: 'max_scroll' };
      }
      if (stableCount >= EXPAND_CONFIG.stableRounds) {
        return { expanded: true, reason: 'stable' };
      }

      await clickShowMoreButtons();

      if (hasReachedReplySection()) {
        return { expanded: true, reason: 'reached_replies' };
      }

      scrollToNextContent();
      scrollCount++;

      await sleep(EXPAND_CONFIG.scrollDelay);

      const currentBlockCount = countThreadTweets();
      if (currentBlockCount > lastBlockCount) {
        stableCount = 0;
      } else {
        stableCount++;
      }
      lastBlockCount = currentBlockCount;
    }
  } finally {
    clearInterval(keepAliveTimer);
    // 滚回顶部，确保提取时的视口是正常的（Twitter 虚拟 DOM 会将移出屏幕的主推文卸载）
    window.scrollTo({ top: 0, behavior: 'auto' });
    await sleep(500);
  }
}

async function expandArticle() {
  const SELECTORS = window.XCE.SELECTORS;
  
  // 如果当前在 status 页面，没有 noteComponent 但有专注模式按钮，则先点击进入专注模式
  if (!document.querySelector(SELECTORS.noteComponent)) {
    const focusBtn = document.querySelector(SELECTORS.focusModeButton);
    if (focusBtn) {
      console.log('[XcontentExtractor] 正在自动进入长文专注模式...');
      focusBtn.click();
      
      // 动态等待长文渲染，最多等 5 秒
      let waitTime = 0;
      while (waitTime < 5000) {
        if (document.querySelector('[data-testid="noteComponent"], [data-testid="twitterArticle"]')) {
          break;
        }
        await sleep(500);
        waitTime += 500;
      }
      
      // 额外缓冲时间让图片开始加载
      await sleep(1000);
    }
  }

  const startTime = Date.now();
  let stableCount = 0;
  
  // 对于长文，我们判断是否真正滚动到底部
  let lastScrollTop = document.documentElement.scrollTop || window.scrollY;

  const keepAliveTimer = setInterval(() => {
    try {
      chrome.runtime.sendMessage({ type: 'KEEPALIVE' });
    } catch (e) {}
  }, EXPAND_CONFIG.keepAliveInterval);

  try {
    while (true) {
      if (Date.now() - startTime > EXPAND_CONFIG.maxWaitTime) {
        return { expanded: true, reason: 'timeout' };
      }
      if (stableCount >= 2) { 
        // 两次滚动高度没有明显变化，视为已经到底
        return { expanded: true, reason: 'stable' };
      }

      window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      await sleep(EXPAND_CONFIG.scrollDelay);

      const currentScrollTop = document.documentElement.scrollTop || window.scrollY;
      if (Math.abs(currentScrollTop - lastScrollTop) < 10) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastScrollTop = currentScrollTop;
    }
  } finally {
    clearInterval(keepAliveTimer);
    // 滚回顶部，确保提取时的视口是正常的
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

async function clickShowMoreButtons() {
  const buttons = document.querySelectorAll(window.XCE.SELECTORS.showMoreButton);
  for (const btn of buttons) {
    try {
      btn.click();
      await sleep(300);
    } catch (e) {}
  }
}

function countThreadTweets() {
  const tweets = document.querySelectorAll(window.XCE.SELECTORS.tweet);
  if (tweets.length === 0) return 0;

  const mainAuthor = window.XCE.getAuthorFromTweet(tweets[0]);
  if (!mainAuthor) return tweets.length;

  let count = 1;
  for (let i = 1; i < tweets.length; i++) {
    if (window.XCE.getAuthorFromTweet(tweets[i]) === mainAuthor) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function hasReachedReplySection() {
  const tweets = document.querySelectorAll(window.XCE.SELECTORS.tweet);
  if (tweets.length < 2) return false;

  const mainAuthor = window.XCE.getAuthorFromTweet(tweets[0]);
  const lastVisibleTweet = tweets[tweets.length - 1];
  const lastBounds = lastVisibleTweet.getBoundingClientRect();

  if (lastBounds.top < window.innerHeight) {
    const lastAuthor = window.XCE.getAuthorFromTweet(lastVisibleTweet);
    if (lastAuthor && lastAuthor !== mainAuthor) {
      return true;
    }
  }

  return false;
}

function scrollToNextContent() {
  const primaryColumn = document.querySelector(window.XCE.SELECTORS.primaryColumn);
  if (primaryColumn) {
    primaryColumn.scrollIntoView({ behavior: 'smooth', block: 'end' });
  } else {
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
