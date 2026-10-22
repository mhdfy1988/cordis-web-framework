import { readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import assert from 'node:assert/strict';
export const contentRoot = resolve('content');
export function sourcePages(): Map<string, string> {
  const recorded = JSON.parse(readFileSync(resolve(contentRoot, 'source-files.json'), 'utf8')) as { files: Record<string, string> };
  const pages = new Map<string, string>();
  for (const file of Object.keys(recorded.files)) {
    if (file.startsWith('docs/') && file.endsWith('.md')) pages.set(file.slice(5), resolve(contentRoot, file));
  }
  for (const [page, file] of [['project-readme.md', 'README.md'], ['changelog.md', 'CHANGELOG.md'], ['third-party-notices.md', 'THIRD_PARTY_NOTICES.md'], ['patches.md', 'patches/README.md']]) pages.set(page, resolve(contentRoot, file));
  const readingOrder = ['index.md', 'guide/concepts.md', 'guide/getting-started.md', 'guide/index.md', 'guide/plugins.md', 'guide/ui.md', 'guide/communication.md', 'guide/templates.md'];
  const rank = (page: string) => { const index = readingOrder.indexOf(page); return index < 0 ? 100 : index; };
  return new Map([...pages].sort(([a], [b]) => rank(a) - rank(b)));
}
export const routeFor = (page: string): string => page === 'index.md' ? '/' : '/' + page.replace(/\.md$/, '');
export function groupFor(page: string): string {
  if (page === 'index.md' || ['guide/index.md', 'guide/getting-started.md', 'guide/concepts.md'].includes(page)) return '开始使用';
  if (/^guide\/(plugins|plugin-management|ui|communication|templates)\.md$/.test(page)) return '开发教程';
  if (page.startsWith('reference/')) return 'API 参考';
  if (page.startsWith('guide/') || /^(changelog|project-readme|third-party-notices|patches)\.md$/.test(page)) return '使用与维护';
  return '架构与研发记录';
}
export function rewriteLink(page: string, href: string, pages: Map<string, string>): string {
  if (/^(https?:|mailto:|tel:)/.test(href)) return href;
  assert.ok(!/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href), '禁止的文档链接协议');
  const [file, anchor] = href.split('#');
  if (!file) return '#' + routeFor(page) + '?section=' + encodeURIComponent(anchor ?? '');
  const target = resolve(dirname(pages.get(page)!), decodeURIComponent(file));
  const match = [...pages].find(([, source]) => source === target);
  if (match) return '#' + routeFor(match[0]) + (anchor ? '?section=' + encodeURIComponent(anchor) : '');
  const example = relative(resolve(contentRoot, 'docs/examples'), target).replaceAll('\\', '/');
  if (/^[a-z-]+\.(mjs|html)$/.test(example)) return '/examples/' + example + '.txt';
  if (href.includes('fluid-block/') && href.endsWith('.md')) return '#/records?section=' + encodeURIComponent('历史来源说明');
  throw new Error(`未映射的文档链接 ${page} → ${href}`);
}
