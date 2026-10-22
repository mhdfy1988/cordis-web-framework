import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const project = fileURLToPath(new URL('../', import.meta.url));
export const siteRoot = resolve(project, 'docs-site');
export function basePath(value = '/cordis-web-framework/') {
  assert.match(value, /^\/(?:[a-zA-Z0-9_-]+\/)*$/, '文档基础路径必须是 / 或安全的 /子路径/'); return value;
}
export function sources() {
  const result = new Map();
  const visit = directory => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.isDirectory()) visit(resolve(directory, item.name));
      else if (item.name.endsWith('.md')) result.set(relative(resolve(project, 'docs'), resolve(directory, item.name)).replaceAll('\\', '/'), resolve(directory, item.name));
    }
  }; visit(resolve(project, 'docs'));
  for (const [page, file] of [['project-readme.md', 'README.md'], ['changelog.md', 'CHANGELOG.md'],
    ['third-party-notices.md', 'THIRD_PARTY_NOTICES.md'], ['patches.md', 'patches/README.md']]) result.set(page, resolve(project, file));
  return result;
}
export function rewriteHref(page, href, pages = sources(), base = basePath(process.env.DOCS_BASE_PATH)) {
  if (/^(?:https?:|mailto:|tel:)/.test(href) || href.startsWith('#')) return { href };
  assert.ok(!/^(?:[a-zA-Z][\w+.-]*:|\/\/)/.test(href), `不允许的文档协议：${page}`);
  const [path, hash] = href.split('#'); const source = pages.get(page); assert.ok(source, `未知文档：${page}`);
  const absolute = resolve(dirname(source), decodeURIComponent(path));
  const matched = [...pages].find(([, file]) => file === absolute);
  // VitePress 的 link_open 会加 base；此处只给站点根路径，不能提前重复拼接。
  if (matched) return { href: '/' + matched[0].replace(/\.md$/, '.html') + (hash ? '#' + hash : '') };
  const example = relative(resolve(project, 'docs/examples'), absolute).replaceAll('\\', '/');
  if (/^[a-z-]+\.(?:mjs|html)$/.test(example)) return { href: `/examples/${example}.txt` };
  const legacy = relative(resolve(project, '../fluid-block'), absolute).replaceAll('\\', '/');
  if (legacy && !legacy.startsWith('../') && !legacy.includes(':') && /\.md$/.test(legacy)) {
    return { href: '/records.html#历史来源说明', legacy: true };
  }
  throw new Error(`文档本地链接没有站内映射：${page} → ${href}`);
}
export function documentationPlugin(pages, base) {
  return md => {
    md.core.ruler.push('framework-source-links', state => {
      const page = state.env.relativePath;
      if (!page) return;
      for (const block of state.tokens) for (const token of block.children ?? []) {
        if (token.type !== 'link_open') continue;
        const original = token.attrGet('href'); if (!original) continue;
        const rewritten = rewriteHref(page, original, pages, base); token.attrSet('href', rewritten.href);
        if (rewritten.legacy) token.attrSet('title', '历史相邻仓库资料未收录；查看本站来源说明');
      }
    });
  };
}
export function content(page, file) {
  let text = readFileSync(file, 'utf8');
  assert.ok(!text.includes('\uFFFD'), `文档编码损坏：${page}`);
  // 站点只为历史长记录添加展示元数据，正文仍来自同一文件。
  if (/^(?:w\d-|implementation-plan|web-framework-plan|architecture-baseline|reuse-evidence)/.test(page)) {
    text = '---\nsearch: false\n---\n\n' + text;
  }
  return text;
}
