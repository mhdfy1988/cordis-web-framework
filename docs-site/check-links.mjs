import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createMarkdownRenderer } from 'vitepress';
import { sources, rewriteHref } from './model.mjs';

export async function checkLinks(pages = sources()) {
  const md = await createMarkdownRenderer(dirname([...pages.values()][0]));
  const parsed = new Map(); let links = 0; let legacy = 0;
  for (const [page, source] of pages) {
    const text = readFileSync(source, 'utf8'); assert.ok(!text.includes('\uFFFD'), `编码错误：${page}`);
    const env = { path: source, relativePath: page }; const tokens = md.parse(text, env);
    const ids = new Set(); const hrefs = [];
    const visit = tokens => { for (const token of tokens) {
      if (token.type === 'heading_open') ids.add(token.attrGet('id'));
      if (token.type === 'link_open') hrefs.push(token.attrGet('href'));
      // 本站是静态正文；可运行 HTML 必须在代码块或独立教程文件，不隐式成为 Vue 模板。
      if (['html_inline', 'html_block'].includes(token.type) && !token.meta?.isPermalinkSymbol) throw new Error(`正文含未转义 HTML／泛型：${page}，请用代码标记或围栏`);
      if (token.children) visit(token.children);
    } }; visit(tokens); parsed.set(page, { ids, hrefs });
  }
  for (const [page, { hrefs }] of parsed) for (const href of hrefs) {
    if (/^(?:https?:|mailto:|tel:)/.test(href)) continue;
    links++; const rewritten = rewriteHref(page, href, pages); if (rewritten.legacy) legacy++;
    const [path, hash] = rewritten.href.split('#');
    if (path.startsWith('/examples/') && path.endsWith('.txt')) continue;
    const target = !path ? page : path.replace(/^\//, '').replace(/\.html$/, '.md');
    assert.ok(parsed.has(target), `文档目标不存在：${page} → ${href}`);
    if (hash) assert.ok(parsed.get(target).ids.has(decodeURIComponent(hash)), `文档锚点不存在：${page} → ${href}`);
  }
  return { pages: parsed.size, links, historicalReferencesExplicit: legacy };
}
