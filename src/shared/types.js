/**
 * XcontentExtractor — 统一数据结构定义
 *
 * 所有提取器输出的中间数据结构，与 DOM 和 Markdown 均解耦。
 * 使用全局命名空间 window.XCE 避免 MV3 content script 不支持 ES modules 的问题。
 */

window.XCE = window.XCE || {};

/**
 * 创建一个空的 DocumentModel
 */
window.XCE.createDocumentModel = function () {
  return {
    source: 'x',
    pageType: 'unsupported',
    title: '',
    url: '',
    author: window.XCE.createAuthor(),
    publishedAt: '',
    extractedAt: new Date().toISOString(),
    language: '',
    description: '',
    blocks: [],
    media: [],
    hashtags: [],
    mentions: [],
    metadata: {},
    threadInfo: null,
  };
};

/**
 * 创建 Author 对象
 */
window.XCE.createAuthor = function (name = '', username = '', profileUrl = '') {
  return { name, username, profileUrl };
};

/**
 * 创建 Block 对象
 */
window.XCE.createBlock = function (type, text = '', extras = {}) {
  return {
    type,
    text,
    children: extras.children || [],
    url: extras.url || '',
    alt: extras.alt || '',
    meta: extras.meta || {},
    tweetId: extras.tweetId || '',
    timestamp: extras.timestamp || '',
  };
};

/**
 * 创建 ThreadInfo 对象
 */
window.XCE.createThreadInfo = function (totalCount = 0, extractedCount = 0) {
  return {
    totalCount,
    extractedCount,
    isComplete: extractedCount === totalCount,
  };
};

/**
 * 错误类型常量
 */
window.XCE.ErrorTypes = {
  UNSUPPORTED_PAGE: 'UNSUPPORTED_PAGE',
  CONTENT_NOT_FOUND: 'CONTENT_NOT_FOUND',
  EXPAND_TIMEOUT: 'EXPAND_TIMEOUT',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
};

/**
 * 错误类型对应的用户提示
 */
window.XCE.ErrorMessages = {
  UNSUPPORTED_PAGE: '当前页面暂不支持导出',
  CONTENT_NOT_FOUND: '没有找到正文内容',
  EXPAND_TIMEOUT: '页面内容展开超时，将导出已加载的内容',
  EXTRACTION_FAILED: '内容提取失败，请稍后重试',
  DOWNLOAD_FAILED: '文件下载失败，请稍后重试',
};

/**
 * 消息类型常量
 */
window.XCE.MessageTypes = {
  EXPORT_MARKDOWN: 'EXPORT_MARKDOWN',
  CHECK_PAGE: 'CHECK_PAGE',
  DOWNLOAD_FILE: 'DOWNLOAD_FILE',
  KEEPALIVE: 'KEEPALIVE',
  STATUS_UPDATE: 'STATUS_UPDATE',
};

/**
 * 导出状态
 */
window.XCE.ExportStatus = {
  IDLE: 'idle',
  UNSUPPORTED: 'unsupported',
  READY: 'ready',
  EXPANDING: 'expanding',
  EXTRACTING: 'extracting',
  GENERATING: 'generating',
  DOWNLOADING: 'downloading',
  DONE: 'done',
  PARTIAL: 'partial',
  ERROR: 'error',
};
