import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { checkLinks } from '../docs-site/check-links.mjs';
import { basePath, rewriteHref, sources } from '../docs-site/model.mjs';

test('链接与锚点合法例通过，错锚点／断链／未转义泛型必须失败', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'cordis-docs-links-'));
  const first = resolve(directory, 'first.md'); const second = resolve(directory, 'second.md');
  const pages = new Map([['first.md', first], ['second.md', second]]);
  writeFileSync(second, '# 第二页\n\n## 中文标题\n');
  writeFileSync(first, '# 第一页\n[查看](second.md#中文标题)\n```ts\nPromise<Value>\n```');
  assert.equal((await checkLinks(pages)).pages, 2);
  writeFileSync(first, '# 第一页\n[错误](second.md#不存在)'); await assert.rejects(checkLinks(pages), /锚点不存在/);
  writeFileSync(first, '# 第一页\n[错误](missing.md)'); await assert.rejects(checkLinks(pages), /没有站内映射/);
  writeFileSync(first, '# 第一页\n返回 Promise<HostHandle>。'); await assert.rejects(checkLinks(pages), /未转义/);
});
test('基础路径与源码映射：只拼一次 base，明确隔离历史引用和源码下载', () => {
  assert.equal(basePath('/nested/docs/'), '/nested/docs/'); assert.equal(basePath('/'), '/');
  for (const invalid of ['https://x/', '//x/', '/../', '/abc']) assert.throws(() => basePath(invalid));
  const pages = sources();
  assert.equal(rewriteHref('guide/index.md', 'plugins.md', pages, '/nested/docs/').href, '/guide/plugins.html');
  assert.equal(rewriteHref('guide/plugins.md', '../examples/plugins.mjs', pages).href, '/examples/plugins.mjs.txt');
  const legacy = rewriteHref('web-framework-plan.md', '../../fluid-block/docs/runtime-adapter.md', pages);
  assert.equal(legacy.legacy, true); assert.match(legacy.href, /records.html#/);
  assert.throws(() => rewriteHref('guide/index.md', 'javascript:alert(1)', pages), /协议/);
});
