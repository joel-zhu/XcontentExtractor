/**
 * XcontentExtractor — Background Service Worker
 *
 * 职责：
 * 1. 接收 content script 的消息
 * 2. 使用 Data URL + chrome.downloads.download 下载 .md 文件
 * 3. 将状态写入 chrome.storage.local
 */

// 监听来自 content script 和 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'DOWNLOAD_FILE':
      handleDownload(message.payload)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // 表示异步发送响应

    case 'KEEPALIVE':
      // Service Worker 心跳，保持存活
      sendResponse({ alive: true });
      return false;

    case 'STATUS_UPDATE':
      // 将状态写入 storage，供 popup 读取
      chrome.storage.local.set({
        exportStatus: message.payload,
      });
      sendResponse({ success: true });
      return false;

    default:
      return false;
  }
});

/**
 * 处理文件下载
 * 使用 Data URL 方案（MV3 Service Worker 中不支持 Blob URL）
 * @param {object} payload - { markdown: string, filename: string }
 */
async function handleDownload({ markdown, filename }) {
  try {
    const dataUrl =
      'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown);

    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false,
    });

    // 更新状态为完成
    await chrome.storage.local.set({
      exportStatus: {
        status: 'done',
        filename: filename,
        timestamp: Date.now(),
      },
    });

    return { success: true, downloadId };
  } catch (error) {
    // 更新状态为错误
    await chrome.storage.local.set({
      exportStatus: {
        status: 'error',
        error: error.message,
        errorType: 'DOWNLOAD_FAILED',
        timestamp: Date.now(),
      },
    });

    throw error;
  }
}
