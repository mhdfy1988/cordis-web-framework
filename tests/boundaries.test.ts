import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
function violations(file: string, content: string) {
  const errors: string[] = [];
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  function inspect(specifier: string) {
    const allowed: Record<string, string> = { cordis: 'runtime-cordis', zod: 'validation-zod',
      semver: 'version-semver', consola: 'logging-consola', fastify: 'hosts/node', 'vue-router': 'presentation-vue' };
    const dependency = specifier.split('/')[0];
    if (allowed[dependency] && !file.startsWith(`src/${allowed[dependency]}/`)) errors.push(`${file}: 第三方边界 ${specifier}`);
    if (specifier.startsWith('node:') && !file.startsWith('src/hosts/node/')) errors.push(`${file}: 公共代码不能依赖 Node`);
    if (/^(vue|@vue|react)(\/|$)/.test(specifier) && !file.startsWith('src/presentation-vue/')) errors.push(`${file}: 无界面核心不能导入呈现库`);
    if (!file.startsWith('src/hosts/node/') && specifier.includes('hosts/node/')) errors.push(`${file}: 非 Node 代码不能导入服务端宿主`);
    if (!file.startsWith('src/hosts/') && !file.startsWith('src/presentation-vue/') && /hosts\/|presentation-vue\//.test(specifier)) errors.push(`${file}: 核心不能依赖宿主／呈现`);
    if (!specifier.startsWith('.')) return;
    const target = relative(root, resolve(root, dirname(file), specifier)).replaceAll('\\', '/');
    if (!target.startsWith('src/')) errors.push(`${file}: 不允许越出本项目源码`);
    if (file.startsWith('src/contracts/') && !target.startsWith('src/contracts/')) errors.push(`${file}: 契约反向依赖实现`);
    if (!file.startsWith('src/runtime-cordis/') && target.startsWith('src/runtime-cordis/')) errors.push(`${file}: 核心不能依赖具体运行适配`);
  }
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) inspect(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) inspect(node.arguments[0].text);
      else if (!['src/hosts/node/plugin-loader.ts', 'src/hosts/browser/plugin-loader.ts', 'src/hosts/node/package-repository.ts', 'src/hosts/browser/package-repository.ts'].includes(file)) errors.push(`${file}: 无法检查非字面量动态导入`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return errors;
}

test('边界：合法例和直接／类型／转导出／动态违规例均通过规则自测', () => {
  for (const [file, input] of [
    ['src/runtime-cordis/index.ts', "import { Context } from 'cordis';"],
    ['src/validation-zod/index.ts', "import { z } from 'zod';"],
    ['src/hosts/node/index.ts', "import 'node:http';"],
    ['src/hosts/node/index.ts', "import Fastify from 'fastify';"],
    ['src/presentation-vue/index.ts', "import { createApp } from 'vue';"],
    ['src/presentation-vue/routing.ts', "import { createRouter } from 'vue-router';"],
    ['src/logging-consola/index.ts', "import { createConsola } from 'consola/core';"],
  ]) assert.deepEqual(violations(file, input), []);
  for (const input of ["import 'cordis';", "import type { Fiber } from 'cordis';", "export * from 'zod';",
    "import('semver');", "import 'consola/core';", "import 'node:fs';", "import '../runtime-cordis/index.ts';",
    "import '../../outside.ts';", "import 'vue';", "import 'vue-router';", 'import(variable);']) {
    assert.ok(violations('src/contracts/invalid.ts', input).length, input);
  }
});

test('边界：实际源码遵守导入规则，公共运行声明不泄漏 Cordis 类型', () => {
  const errors: string[] = [];
  function check(directory: string) {
    for (const file of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${file.name}`;
      if (file.isDirectory()) check(path);
      else if (path.endsWith('.ts')) errors.push(...violations(path, readFileSync(resolve(root, path), 'utf8')));
    }
  }
  check('src');
  assert.deepEqual(errors, []);
  const declaration = readFileSync(resolve(root, 'dist/runtime-cordis/index.d.ts'), 'utf8');
  assert.equal(declaration.includes("from 'cordis'"), false);
});
