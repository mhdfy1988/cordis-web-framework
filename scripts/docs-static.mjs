import Fastify from 'fastify';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import assert from 'node:assert/strict';
import { root } from './run.mjs';
import { basePath } from '../docs-site/model.mjs';
import { digest, treeHashes } from './delivery-policy.mjs';

export function docsInputs() {
  const result = {};
  const visit = directory => { for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.generated', 'cache'].includes(item.name)) continue;
    const path = resolve(directory, item.name); const name = relative(root, path).replaceAll('\\', '/');
    if (name === 'docs/implementation-plan.md') continue;
    if (item.isDirectory()) visit(path); else result[name] = digest(path);
  } };
  visit(resolve(root, 'docs')); visit(resolve(root, 'docs-site'));
  for (const file of ['README.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', 'patches/README.md']) result[file] = digest(resolve(root, file));
  for (const file of ['docs-build.mjs', 'docs-check.mjs', 'docs-static.mjs', 'docs-browser-check.mjs']) result[`scripts/${file}`] = digest(resolve(root, 'scripts', file));
  return result;
}
export async function startDocsStatic() {
  const report = JSON.parse(readFileSync(resolve(root, 'output/docs-site-build.json'), 'utf8'));
  assert.deepEqual(docsInputs(), report.inputs, '文档输入已变化，请重新 docs:build');
  const directory = resolve(root, 'output/docs-site'); assert.deepEqual(treeHashes(directory), report.files, '文档产物已变化，请重新构建');
  const base = basePath(report.base); const server = Fastify({ logger: false });
  const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
    txt: 'text/plain; charset=utf-8', json: 'application/json', woff2: 'font/woff2', svg: 'image/svg+xml', png: 'image/png' };
  const visit = path => { for (const item of readdirSync(path, { withFileTypes: true })) {
    const file = resolve(path, item.name); assert.ok(!lstatSync(file).isSymbolicLink());
    if (item.isDirectory()) { visit(file); continue; }
    const name = relative(directory, file).replaceAll('\\', '/'); const content = readFileSync(file);
    const route = name === 'index.html' ? base : base + name;
    const handle = (_request, reply) => reply.type(types[name.split('.').at(-1)] ?? 'application/octet-stream')
      .header('x-content-type-options', 'nosniff').header('cache-control', 'no-store').send(content);
    server.get(route, handle);
    if (name === 'index.html') server.get(base + name, handle);
    if (name.endsWith('/index.html')) server.get(base + name.slice(0, -'index.html'.length), handle);
  } }; visit(directory);
  const origin = await server.listen({ host: '127.0.0.1', port: 0 });
  return { server, origin, base, address: origin + base, report };
}
