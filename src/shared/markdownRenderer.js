/**
 * XcontentExtractor — Markdown 纯函数渲染器
 *
 * 将 DocumentModel 转换为 Markdown 字符串。
 * 自写渲染器，不依赖第三方库。
 */

window.XCE = window.XCE || {};

/**
 * 将 DocumentModel 渲染为 Markdown 字符串
 */
window.XCE.renderMarkdown = function (model) {
  const lines = [];

  // === 文档头 ===
  lines.push(renderHeader(model));
  lines.push('');
  lines.push('---');
  lines.push('');

  // === 正文 blocks ===
  for (const block of model.blocks) {
    lines.push(renderBlock(block));
    lines.push('');
  }

  // === Thread 不完整警告 ===
  if (model.threadInfo && !model.threadInfo.isComplete) {
    lines.push('---');
    lines.push('');
    lines.push(
      `> ⚠️ 本次导出可能不完整。检测到 ${model.threadInfo.totalCount} 条推文，实际提取 ${model.threadInfo.extractedCount} 条。`
    );
    lines.push('');
  }

  // === 文档尾 ===
  lines.push('---');
  lines.push('');
  lines.push(
    `*Exported by XcontentExtractor at ${formatDate(model.extractedAt)}*`
  );
  lines.push('');

  return lines.join('\n');
};

function renderHeader(model) {
  const lines = [];

  lines.push(`# ${model.title || 'Untitled'}`);
  lines.push('');

  if (model.author.name || model.author.username) {
    const authorLine = [
      model.author.name ? `**${model.author.name}**` : '',
      model.author.username ? `(@${model.author.username})` : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (model.author.profileUrl) {
      lines.push(`Author: [${authorLine}](${model.author.profileUrl})`);
    } else {
      lines.push(`Author: ${authorLine}`);
    }
  }

  if (model.publishedAt) {
    lines.push(`Published: ${formatDate(model.publishedAt)}`);
  }

  if (model.pageType === 'thread' && model.threadInfo) {
    lines.push(`Type: Thread (${model.threadInfo.extractedCount} posts)`);
  } else if (model.type === 'article' || model.pageType === 'article') {
    lines.push('Type: Article');
  } else {
    lines.push('Type: Tweet');
  }

  if (model.url) {
    lines.push(`Source: ${model.url}`);
  }

  return lines.join('\n');
}

function renderBlock(block) {
  switch (block.type) {
    case 'heading':
      return renderHeading(block);
    case 'paragraph':
      return renderParagraph(block);
    case 'image':
      return renderImage(block);
    case 'quote':
      return renderQuote(block);
    case 'tweet_embed':
      return renderTweetEmbed(block);
    case 'link':
      return renderLink(block);
    case 'list':
      return renderList(block);
    case 'code':
      return '```\n' + (block.text || block.content || '') + '\n```';
    case 'separator':
      return '---';
    case 'video':
      return `[📹 视频](${block.url})`;
    default:
      return block.text || block.content || '';
  }
}

function renderHeading(block) {
  const level = block.meta?.level || block.level || 2;
  const prefix = '#'.repeat(Math.min(level, 6));
  return `${prefix} ${block.text || block.content}`;
}

function renderParagraph(block) {
  return block.text || block.content || '';
}

function renderImage(block) {
  const alt = block.alt || 'Image';
  const url = block.url || '';
  return `![${alt}](${url})`;
}

function renderQuote(block) {
  const author = block.meta?.author || '';
  const lines = [];

  if (author) {
    lines.push(`> **${author}:**`);
  }

  const textLines = (block.text || block.content || '').split('\n');
  for (const line of textLines) {
    if (line.trim()) lines.push(`> ${line}`);
  }

  return lines.join('\n');
}

function renderList(block) {
  const lines = [];
  const items = block.items || [];
  for (let i = 0; i < items.length; i++) {
    const prefix = block.ordered ? `${i + 1}.` : '-';
    lines.push(`${prefix} ${items[i]}`);
  }
  return lines.join('\n');
}

function renderTweetEmbed(block) {
  const author = block.meta?.author || '';
  const text = block.text || '';
  return `> 🔗 引用 ${author}: ${text}`;
}

function renderLink(block) {
  const text = block.text || block.url || 'Link';
  const url = block.url || '';
  return `[${text}](${url})`;
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai',
    });
  } catch {
    return isoString;
  }
}
