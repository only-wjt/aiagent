import MarkdownIt from 'markdown-it'
import type { Options } from 'markdown-it/lib/index.mjs'
import type Renderer from 'markdown-it/lib/renderer.mjs'
import type Token from 'markdown-it/lib/token.mjs'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

const defaultFence =
  md.renderer.rules.fence?.bind(md.renderer.rules)
  ?? ((tokens: Token[], idx: number, options: Options, _env: unknown, self: Renderer) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens: Token[], idx: number, options: Options, _env: unknown, self: Renderer) => {
  const token = tokens[idx]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.fence = (tokens: Token[], idx: number, options: Options, env: unknown, self: Renderer) => {
  const token = tokens[idx]
  const info = token.info.trim().split(/\s+/)[0] || 'code'
  const rendered = defaultFence(tokens, idx, options, env, self)

  return [
    '<div class="code-block-wrap">',
    '<div class="code-block-header">',
    `<span class="code-lang">${md.utils.escapeHtml(info)}</span>`,
    `<button class="code-copy-btn" onclick="(function(btn){var code=btn.parentElement?.nextElementSibling?.innerText||'';navigator.clipboard.writeText(code);var old=btn.textContent;btn.textContent='✅ 已复制';setTimeout(function(){btn.textContent=old||'📋 复制'},1500)})(this)">📋 复制</button>`,
    '</div>',
    rendered,
    '</div>',
  ].join('')
}

export function renderMarkdown(text: string): string {
  if (!text) return ''
  return md.render(text)
}
