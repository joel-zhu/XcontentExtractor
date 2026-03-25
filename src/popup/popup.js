/**
 * XcontentExtractor — Popup 逻辑
 *
 * 职责：
 * 1. 显示当前页面是否可导出
 * 2. 触发导出操作
 * 3. 从 chrome.storage.local 读取状态并更新 UI
 */

// DOM 元素
const statusCards = {
  loading: document.getElementById('status-loading'),
  unsupported: document.getElementById('status-unsupported'),
  ready: document.getElementById('status-ready'),
  processing: document.getElementById('status-processing'),
  done: document.getElementById('status-done'),
  partial: document.getElementById('status-partial'),
  error: document.getElementById('status-error'),
};

const exportBtn = document.getElementById('export-btn');
const pageTypeEl = document.getElementById('page-type');
const processingMsg = document.getElementById('processing-message');
const downloadFilename = document.getElementById('download-filename');
const partialFilename = document.getElementById('partial-filename');
const errorMessage = document.getElementById('error-message');

// 处理中消息映射
const PROCESSING_MESSAGES = {
  expanding: '正在展开内容…',
  extracting: '正在提取内容…',
  generating: '正在生成 Markdown…',
  downloading: '正在下载文件…',
};

// 页面类型显示名
const PAGE_TYPE_NAMES = {
  tweet_detail: '📄 单条推文',
  thread: '🧵 Thread 线程',
  article: '📝 X 长文',
};

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  // 1. 先检查 storage 中的状态（可能上次导出还没完成）
  const stored = await chrome.storage.local.get('exportStatus');
  if (stored.exportStatus) {
    const status = stored.exportStatus;
    // 如果是处理中状态，显示进度
    if (['expanding', 'extracting', 'generating', 'downloading'].includes(status.status)) {
      showStatus('processing');
      processingMsg.textContent = PROCESSING_MESSAGES[status.status] || '正在处理…';
      return;
    }
    // 如果刚完成，显示结果
    if (status.status === 'done' && Date.now() - status.timestamp < 30000) {
      showStatus('done');
      downloadFilename.textContent = status.filename || '';
      return;
    }
    if (status.status === 'partial' && Date.now() - status.timestamp < 30000) {
      showStatus('partial');
      partialFilename.textContent = status.filename || '';
      return;
    }
  }

  // 2. 检测当前页面类型
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_PAGE' });

    if (response && response.supported) {
      showStatus('ready');
      pageTypeEl.textContent = PAGE_TYPE_NAMES[response.pageType] || response.pageType;
      exportBtn.classList.remove('hidden');
      exportBtn.disabled = false;
    } else {
      showStatus('unsupported');
    }
  } catch (err) {
    console.error('[Popup] 检测页面失败:', err);
    showStatus('unsupported');
  }
});

// ============================================================
// 导出按钮点击
// ============================================================

exportBtn.addEventListener('click', async () => {
  exportBtn.disabled = true;
  showStatus('processing');
  processingMsg.textContent = '正在提取内容…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXPORT_MARKDOWN' });

    if (response && response.success) {
      if (response.partial) {
        showStatus('partial');
        partialFilename.textContent = response.filename || '';
      } else {
        showStatus('done');
        downloadFilename.textContent = response.filename || '';
      }
    } else {
      showStatus('error');
      errorMessage.textContent = getErrorMessage(response?.errorType) || '导出失败，请重试';
    }
  } catch (err) {
    console.error('[Popup] 导出失败:', err);
    showStatus('error');
    errorMessage.textContent = '导出失败，请刷新页面后重试';
  }
});

// ============================================================
// 监听 storage 变化（实时更新进度）
// ============================================================

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.exportStatus) return;

  const status = changes.exportStatus.newValue;
  if (!status) return;

  switch (status.status) {
    case 'expanding':
    case 'extracting':
    case 'generating':
    case 'downloading':
      showStatus('processing');
      processingMsg.textContent = PROCESSING_MESSAGES[status.status] || '正在处理…';
      break;

    case 'done':
      showStatus('done');
      downloadFilename.textContent = status.filename || '';
      break;

    case 'partial':
      showStatus('partial');
      partialFilename.textContent = status.filename || '';
      break;

    case 'error':
      showStatus('error');
      errorMessage.textContent = status.errorMessage || '导出失败';
      break;
  }
});

// ============================================================
// 工具函数
// ============================================================

/**
 * 显示指定状态卡片，隐藏其他
 * @param {string} statusName
 */
function showStatus(statusName) {
  for (const [name, card] of Object.entries(statusCards)) {
    if (name === statusName) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  }
}

/**
 * 根据错误类型获取用户友好的提示
 * @param {string} errorType
 * @returns {string}
 */
function getErrorMessage(errorType) {
  const messages = {
    UNSUPPORTED_PAGE: '当前页面暂不支持导出',
    CONTENT_NOT_FOUND: '没有找到正文内容',
    EXPAND_TIMEOUT: '页面内容展开超时',
    EXTRACTION_FAILED: '内容提取失败，请稍后重试',
    DOWNLOAD_FAILED: '文件下载失败，请稍后重试',
  };
  return messages[errorType] || '未知错误';
}
