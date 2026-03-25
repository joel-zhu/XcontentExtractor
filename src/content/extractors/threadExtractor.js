/**
 * XcontentExtractor — Thread 合并提取器
 */

window.XCE = window.XCE || {};

/**
 * 提取 Thread（同作者连续推文合并）
 */
window.XCE.extractThread = function () {
  const SELECTORS = window.XCE.SELECTORS;
  const allTweets = document.querySelectorAll(SELECTORS.tweet);
  if (allTweets.length === 0) return null;

  const mainTweet = allTweets[0];
  const mainAuthor = window.XCE.getAuthorFromTweet(mainTweet);
  if (!mainAuthor) return null;

  // 收集同作者连续推文
  const threadTweets = [mainTweet];
  for (let i = 1; i < allTweets.length; i++) {
    const author = window.XCE.getAuthorFromTweet(allTweets[i]);
    if (author === mainAuthor) {
      threadTweets.push(allTweets[i]);
    } else {
      break;
    }
  }

  const totalCount = threadTweets.length;

  // 构建 DocumentModel
  const model = window.XCE.createDocumentModel();
  model.pageType = 'thread';
  model.url = location.href;
  model.author = window.XCE.extractAuthorInfo(mainTweet);
  model.publishedAt = window.XCE.extractTimestamp(mainTweet);

  // 标题
  const firstTextEl = mainTweet.querySelector(SELECTORS.tweetText);
  const firstText = window.XCE.normalizeText(firstTextEl);
  model.title = firstText.substring(0, 60).replace(/\n/g, ' ').trim();
  if (firstText.length > 60) model.title += '…';

  // 逐条提取
  let extractedCount = 0;
  const allHashtags = new Set();
  const allMentions = new Set();

  for (let i = 0; i < threadTweets.length; i++) {
    const tweet = threadTweets[i];

    try {
      if (i > 0) {
        model.blocks.push(window.XCE.createBlock('separator'));
      }

      model.blocks.push(
        window.XCE.createBlock('heading', `Post ${i + 1}`, { meta: { level: 2 } })
      );

      const textEl = tweet.querySelector(SELECTORS.tweetText);
      const text = window.XCE.normalizeText(textEl);
      const tweetId = extractTweetId(tweet);
      const timestamp = window.XCE.extractTimestamp(tweet);

      if (text) {
        model.blocks.push(
          window.XCE.createBlock('paragraph', text, { tweetId, timestamp })
        );
      }

      const images = window.XCE.extractImages(tweet);
      for (const img of images) {
        model.blocks.push(
          window.XCE.createBlock('image', '', { url: img.url, alt: img.alt, tweetId })
        );
        model.media.push(img);
      }

      const videos = window.XCE.extractVideos(tweet);
      for (const video of videos) {
        model.blocks.push(
          window.XCE.createBlock('video', '', { url: video.url, tweetId })
        );
        model.media.push(video);
      }

      const quote = window.XCE.extractQuoteTweet(tweet);
      if (quote) model.blocks.push(quote);

      window.XCE.extractHashtags(textEl).forEach((t) => allHashtags.add(t));
      window.XCE.extractMentions(textEl).forEach((m) => allMentions.add(m));

      extractedCount++;
    } catch (err) {
      console.warn(`[XcontentExtractor] Thread 第 ${i + 1} 条提取失败:`, err);
      try {
        const fallbackText = tweet.innerText?.substring(0, 500)?.trim();
        if (fallbackText) {
          model.blocks.push(
            window.XCE.createBlock('paragraph', `${fallbackText}\n\n_[可能存在格式问题]_`)
          );
          extractedCount++;
        }
      } catch (e) {
        // 完全失败，跳过
      }
    }
  }

  model.threadInfo = window.XCE.createThreadInfo(totalCount, extractedCount);
  model.hashtags = [...allHashtags];
  model.mentions = [...allMentions];

  return model;
};

function extractTweetId(tweetElement) {
  const statusLink = tweetElement.querySelector('a[href*="/status/"]');
  if (statusLink) {
    const match = statusLink.getAttribute('href').match(/\/status\/(\d+)/);
    if (match) return match[1];
  }
  return '';
}
