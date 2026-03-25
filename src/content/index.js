/**
 * XcontentExtractor — Content Script 入口
 *
 * 职责：
 * 1. 监听 SPA 路由变化（X 是 React SPA）
 * 2. 接收 popup 的导出请求
 * 3. 调度：页面检测 → 展开 → 提取 → 生成 Markdown → 发送给 background 下载
 */

(function () {
  'use strict';

  const XCE = window.XCE;

  // ============================================================
  // SPA 路由变化监听
  // ============================================================

  let lastUrl = location.href;

  function onRouteChange() {
    waitForContent().then(() => {
      const pageType = XCE.detectPageType();
      updateStatus({
        status:
          pageType === 'unsupported'
            ? XCE.ExportStatus.UNSUPPORTED
            : XCE.ExportStatus.READY,
        pageType: pageType,
        url: location.href,
      });
    });
  }

  // 方法 1：拦截 History API
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    onRouteChange();
  };
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    onRouteChange();
  };
  window.addEventListener('popstate', onRouteChange);

  // 方法 2：URL 轮询
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onRouteChange();
    }
  }, 1000);

  // ============================================================
  // 等待页面内容加载
  // ============================================================

  function waitForContent(timeout = 5000) {
    return new Promise((resolve) => {
      if (document.querySelector(XCE.SELECTORS.tweet)) {
        resolve(true);
        return;
      }

      const observer = new MutationObserver(() => {
        if (document.querySelector(XCE.SELECTORS.tweet)) {
          observer.disconnect();
          resolve(true);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeout);
    });
  }

  // ============================================================
  // 消息监听
  // ============================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'CHECK_PAGE': {
        const pageType = XCE.detectPageType();
        sendResponse({
          pageType,
          url: location.href,
          supported: pageType !== 'unsupported',
        });
        return false;
      }

      case 'EXPORT_MARKDOWN':
        handleExport()
          .then((result) => sendResponse(result))
          .catch((error) =>
            sendResponse({ success: false, error: error.message })
          );
        return true;

      default:
        return false;
    }
  });

  // ============================================================
  // 导出主流程
  // ============================================================

  async function handleExport() {
    try {
      // 1. 检测页面类型
      updateStatus({ status: XCE.ExportStatus.EXTRACTING });
      const pageType = XCE.detectPageType();

      if (pageType === 'unsupported') {
        updateStatus({
          status: XCE.ExportStatus.ERROR,
          errorType: XCE.ErrorTypes.UNSUPPORTED_PAGE,
          errorMessage: XCE.ErrorMessages.UNSUPPORTED_PAGE,
        });
        return { success: false, errorType: XCE.ErrorTypes.UNSUPPORTED_PAGE };
      }

      // 2. 页面展开
      updateStatus({ status: XCE.ExportStatus.EXPANDING });
      await XCE.expandPageIfNeeded(pageType);

      // 等待 Twitter 虚拟 DOM 在回滚顶部后重新渲染主推文
      await waitForContent(3000);

      // 3. 提取内容
      updateStatus({ status: XCE.ExportStatus.EXTRACTING });
      let documentModel;

      if (pageType === 'tweet_detail') {
        documentModel = XCE.extractTweet();
      } else if (pageType === 'thread') {
        documentModel = XCE.extractThread();
      } else if (pageType === 'article') {
        documentModel = XCE.extractArticle();
      }

      if (!documentModel || !documentModel.blocks.length) {
        updateStatus({
          status: XCE.ExportStatus.ERROR,
          errorType: XCE.ErrorTypes.CONTENT_NOT_FOUND,
          errorMessage: XCE.ErrorMessages.CONTENT_NOT_FOUND,
        });
        return { success: false, errorType: XCE.ErrorTypes.CONTENT_NOT_FOUND };
      }

      // 4. 生成 Markdown
      updateStatus({ status: XCE.ExportStatus.GENERATING });
      const markdown = XCE.renderMarkdown(documentModel);

      // 5. 生成文件名
      const filename = generateFilename(documentModel);

      // 6. 发送给 background 下载
      updateStatus({ status: XCE.ExportStatus.DOWNLOADING });
      const downloadResult = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_FILE',
        payload: { markdown, filename },
      });

      if (downloadResult.success) {
        const isPartial =
          documentModel.threadInfo && !documentModel.threadInfo.isComplete;

        updateStatus({
          status: isPartial ? XCE.ExportStatus.PARTIAL : XCE.ExportStatus.DONE,
          filename,
        });

        return { success: true, filename, partial: isPartial };
      } else {
        throw new Error(downloadResult.error || '下载失败');
      }
    } catch (error) {
      console.error('[XcontentExtractor] 导出失败:', error);
      updateStatus({
        status: XCE.ExportStatus.ERROR,
        errorType: XCE.ErrorTypes.EXTRACTION_FAILED,
        errorMessage: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  function updateStatus(statusObj) {
    statusObj.timestamp = Date.now();
    chrome.runtime.sendMessage({
      type: 'STATUS_UPDATE',
      payload: statusObj,
    });
  }

  function generateFilename(model) {
    const username = model.author.username || 'unknown';
    const date = model.publishedAt
      ? new Date(model.publishedAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    let titleSlug = (model.title || 'untitled')
      .substring(0, 40)
      .trim()
      .replace(/[\/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+$/, '');

    return `x-${username}-${date}-${titleSlug}.md`;
  }

  // ============================================================
  // 初始化
  // ============================================================

  window.XCE._videoCache = {};
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'XCE_VIDEO_DATA_UPDATED') {
      Object.assign(window.XCE._videoCache, e.data.data);
      console.log('[XCE] 已同步视频数据缓存:', window.XCE._videoCache);
    }
  });

  waitForContent().then(() => {
    const pageType = XCE.detectPageType();
    updateStatus({
      status:
        pageType === 'unsupported'
          ? XCE.ExportStatus.UNSUPPORTED
          : XCE.ExportStatus.READY,
      pageType: pageType,
      url: location.href,
    });
  });
})();
