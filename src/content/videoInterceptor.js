/**
 * XcontentExtractor — Video Interceptor Script
 *
 * 运行在 MAIN world（页面上下文），劫持 XMLHttpRequest 以截获 Twitter GraphQL 响应，
 * 从响应体中解析视频 mp4 直链。
 *
 * 数据传递方式：
 * 1. 实时：通过 window.postMessage 通知 Content Script（ISOLATED world）
 * 2. 按需：将数据写入隐藏 DOM 元素的 dataset，供 Content Script 同步读取
 */

(function () {
  'use strict';

  // 避免重复注入
  if (window.__XCE_INTERCEPTOR_HOOKED__) return;
  window.__XCE_INTERCEPTOR_HOOKED__ = true;

  console.log('[XCE-Video] 视频拦截器已注入页面上下文');

  // 视频数据存储：{ tweetId: [{ url, bitrate, type }] }
  window.__XCE_VIDEO_DATA__ = {};

  // 创建一个隐藏 DOM 元素作为跨 world 数据桥
  const bridge = document.createElement('div');
  bridge.id = '__xce_video_bridge__';
  bridge.style.display = 'none';
  document.documentElement.appendChild(bridge);

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._xceUrl = url;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      const url = this._xceUrl;
      if (
        url &&
        typeof url === 'string' &&
        (url.includes('TweetDetail') || url.includes('TweetResultByRestId'))
      ) {
        try {
          if (this.responseText) {
            const data = JSON.parse(this.responseText);
            processGraphQLResponse(data, url);
          }
        } catch (e) {
          console.error('[XCE-Video] 解析 GraphQL 响应失败:', e);
        }
      }
    });

    return originalXHRSend.apply(this, arguments);
  };

  /**
   * 处理 GraphQL JSON 响应
   * 只提取结构明确的 tweet 对象（有 rest_id + legacy.extended_entities.media）
   */
  function processGraphQLResponse(data, url) {
    const tweetVideoMap = extractTweetVideos(data);
    let newVideosFound = false;

    for (const [tweetId, videos] of Object.entries(tweetVideoMap)) {
      if (!window.__XCE_VIDEO_DATA__[tweetId]) {
        window.__XCE_VIDEO_DATA__[tweetId] = [];
      }

      for (const video of videos) {
        // 去重
        const exists = window.__XCE_VIDEO_DATA__[tweetId].some(
          (v) => v.url === video.url
        );
        if (!exists) {
          window.__XCE_VIDEO_DATA__[tweetId].push(video);
          newVideosFound = true;
          console.log(
            `[XCE-Video] 截获视频 → tweetId: ${tweetId}, bitrate: ${video.bitrate}, URL: ${video.url}`
          );
        }
      }
    }

    if (newVideosFound) {
      syncToDOM();
      // 使用 postMessage 通知 Content Script（ISOLATED world）
      window.postMessage(
        {
          type: 'XCE_VIDEO_DATA_UPDATED',
          data: JSON.parse(JSON.stringify(window.__XCE_VIDEO_DATA__)),
        },
        '*'
      );
    }
  }

  /**
   * 从 GraphQL 响应中提取所有 tweet 的视频信息
   * 采用精确匹配：只认 { rest_id, legacy: { extended_entities: { media } } } 结构
   * 返回 { tweetId: [{ url, bitrate, type: 'video' }] }
   */
  function extractTweetVideos(obj, result = {}) {
    if (!obj || typeof obj !== 'object') return result;

    // 精确匹配 tweet 结构节点
    if (
      obj.rest_id &&
      obj.legacy &&
      obj.legacy.extended_entities &&
      Array.isArray(obj.legacy.extended_entities.media)
    ) {
      const tweetId = String(obj.rest_id);
      const mediaList = obj.legacy.extended_entities.media;

      for (const media of mediaList) {
        if (
          media.video_info &&
          Array.isArray(media.video_info.variants)
        ) {
          // 取 video/mp4 格式中 bitrate 最高的
          const mp4s = media.video_info.variants
            .filter(
              (v) =>
                v.content_type === 'video/mp4' &&
                typeof v.bitrate === 'number'
            )
            .sort((a, b) => b.bitrate - a.bitrate);

          if (mp4s.length > 0) {
            if (!result[tweetId]) result[tweetId] = [];
            result[tweetId].push({
              url: mp4s[0].url,
              bitrate: mp4s[0].bitrate,
              type: 'video',
            });
          }
        }
      }
    }

    // 递归遍历子属性
    if (Array.isArray(obj)) {
      for (const item of obj) {
        extractTweetVideos(item, result);
      }
    } else {
      for (const key of Object.keys(obj)) {
        // 跳过已遍历的 rest_id/legacy 路径上的叶子值
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          extractTweetVideos(obj[key], result);
        }
      }
    }

    return result;
  }

  /**
   * 将视频数据同步写入 DOM 元素，供 Content Script 按需读取
   */
  function syncToDOM() {
    const el = document.getElementById('__xce_video_bridge__');
    if (el) {
      el.dataset.videoData = JSON.stringify(window.__XCE_VIDEO_DATA__);
    }
  }
})();
