/**
 * Markdown 渲染工具 — 轻量级自定义渲染器
 *
 * 支持：代码块（带复制按钮）、行内代码、粗体、斜体、标题、列表、链接、换行
 * 不依赖外部库，性能好，适用于流式渲染场景
 */

/** 将 Markdown 文本渲染为 HTML */
export function renderMarkdown(text: string): string {
  if (!text) return ''

  // 1. 提取代码块，替换为占位符（避免转义）
  const codeBlocks: string[] = []
  let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    codeBlocks.push(`<pre class="code-block"><div class="code-block-header"><span class="code-lang">${lang || 'code'}</span><button class="code-copy-btn" onclick="(function(btn){var code=btn.closest('.code-block').querySelector('code').innerText;navigator.clipboard.writeText(code);btn.textContent='✅ 已复制';setTimeout(function(){btn.textContent='📋 复制'},1500)})(this)">📋 复制</button></div><code class="language-${lang || 'text'}">${escaped}</code></pre>`)
    return `\x00CB${codeBlocks.length - 1}\x00`
  })

  // 2. 转义 HTML（安全）
  processed = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 3. 行内代码
  processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

  // 4. 粗体 / 斜体
  processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 5. 标题
  processed = processed.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  processed = processed.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  processed = processed.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  processed = processed.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // 6. 有序列表
  processed = processed.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')

  // 7. 无序列表
  processed = processed.replace(/^[•\-\*]\s+(.+)$/gm, '<li>$1</li>')
  processed = processed.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
  processed = processed.replace(/<\/ul>\s*<ul>/g, '')

  // 8. 链接
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  // 9. 换行
  processed = processed.replace(/\n/g, '<br/>')

  // 10. 恢复代码块占位符
  processed = processed.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)])

  return processed
}
