import { createMarkdownRenderer, disposeMdItInstance } from 'vitepress';
import { parseHTML } from 'linkedom';
import MiniSearch from 'minisearch';
import { readFileSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { contentRoot, sourcePages, routeFor, rewriteLink, groupFor } from './content-model.ts';
import { searchOptions } from '../application/shared/documents.ts';
import type { DocumentPage, SiteManifest } from '../application/shared/documents.ts';

export async function compileDocuments(destination: string, base: string): Promise<SiteManifest> {
  assert.match(base, /^\/(?:[a-zA-Z0-9_-]+\/)*$/); const pages = sourcePages();
  // 编辑稿显式替换站点正文，保留原始快照、页面身份和相对链接基准。
  const editions = z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(resolve(contentRoot, 'editions.json'), 'utf8')));
  for (const [page, file] of Object.entries(editions)) {
    assert.ok(pages.has(page), `编辑稿不能隐式新增页面：${page}`);
    assert.equal(file, 'editions/' + page, `编辑稿路径必须与页面对应：${page}`);
  }
  const md = await createMarkdownRenderer(contentRoot, { theme: { light: 'github-light', dark: 'github-dark' } }, base);
  md.core.ruler.push('application-links', state => {
    const page = state.env.relativePath as string;
    for (const block of state.tokens) for (const token of block.children ?? []) {
      if (token.type === 'link_open') token.attrSet('href', rewriteLink(page, token.attrGet('href') ?? '', pages));
    }
  });
  const rendered: DocumentPage[] = [];
  try {
    for (const [page, source] of pages) {
      const env = { relativePath: page, path: source }; const input = readFileSync(editions[page] ? resolve(contentRoot, editions[page]) : source, 'utf8');
      assert.ok(!input.includes('\uFFFD'), `编码损坏：${page}`);
      const tokens = md.parse(input, env);
      assert.ok(!tokens.some(token => token.type === 'html_block' || token.children?.some(child => child.type === 'html_inline' && !child.meta?.isPermalinkSymbol)), `当前文档必须为静态 Markdown，不能悄悄丢弃 Vue／HTML：${page}`);
      const html = md.render(input, env); const document = parseHTML(`<html><body><article>${html}</article></body></html>`).document;
      const article = document.querySelector('article')!;
      for (const button of article.querySelectorAll('button.copy')) { button.setAttribute('aria-label', '复制代码'); button.setAttribute('title', '复制代码'); }
      for (const anchor of article.querySelectorAll('a[href]')) {
        const href = anchor.getAttribute('href')!;
        if (href.startsWith('#') && !href.startsWith('#/')) anchor.setAttribute('href', rewriteLink(page, href, pages));
      }
      const headings = [...article.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(element => ({ id: element.id, text: element.textContent?.replace(/\u200b/g, '').trim() ?? '', level: Number(element.localName.slice(1)) }));
      rendered.push({ id: page, title: headings.find(item => item.level === 1)?.text ?? page, route: routeFor(page), group: groupFor(page),
        file: 'pages/' + rendered.length + '.json', html: article.innerHTML, text: article.textContent ?? '', headings });
    }
  } finally { disposeMdItInstance(); }
  let links = 0;
  for (const page of rendered) {
    const document = parseHTML(`<html><body>${page.html}</body></html>`).document;
    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href')!; if (!href.startsWith('#/')) continue;
      const url = new URL(href.slice(1), 'https://docs.invalid'); const target = rendered.find(item => item.route === url.pathname);
      assert.ok(target, `断链：${page.id} → ${href}`); const section = url.searchParams.get('section');
      if (section) assert.ok(target.headings.some(item => item.id === section), `锚点不存在：${page.id} → ${href}`); links++;
    }
  }
  mkdirSync(resolve(destination, 'pages'), { recursive: true });
  for (const page of rendered) writeFileSync(resolve(destination, page.file), JSON.stringify(page));
  const manifest: SiteManifest = { version: 1, base, builtAt: new Date().toISOString(), pages: rendered.map(({ html: _html, text: _text, headings: _headings, ...meta }) => meta) };
  const index = new MiniSearch(searchOptions); index.addAll(rendered.map(({ id, title, route, text }) => ({ id, title, route, text })));
  writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(resolve(destination, 'search.json'), JSON.stringify(index));
  mkdirSync(resolve(destination, 'examples'), { recursive: true });
  for (const file of ['plugins.mjs', 'http.mjs', 'ui.mjs', 'ui.html']) cpSync(resolve(contentRoot, 'docs/examples', file), resolve(destination, 'examples', file + '.txt'));
  writeFileSync(resolve(destination, 'content-check.json'), JSON.stringify({ pages: rendered.length, links, sourceFiles: [...pages.keys()], editions }, null, 2));
  return manifest;
}
