import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
const app = resolve(import.meta.dirname, '../examples/png-resizer');
function violations(file: string, content: string) {
  const result: string[] = []; const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  function inspect(value: string) {
    if (value.startsWith('.')) {
      const location = relative(app, resolve(dirname(file), value)); if (location.startsWith('..') || /^[A-Z]:/i.test(location)) result.push(value);
    } else if (!(value === 'vue' || value === 'zod' || /^cordis-web-framework(?:\/(?:runtime-cordis|composition|commands|ui|validation-zod|presentation-vue(?:\/ui)?))?$/.test(value))) result.push(value);
  }
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) inspect(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) inspect(node.arguments[0].text); else result.push('动态路径');
    }
    ts.forEachChild(node, visit);
  }
  visit(source); return result;
}
test('纯浏览器应用边界：正反例验证，不允许借记录业务、框架源码或服务器能力', () => {
  for (const value of ['vue', 'zod', 'cordis-web-framework/ui', 'cordis-web-framework/presentation-vue', './domain.ts']) assert.deepEqual(violations(resolve(app, 'fixture.ts'), `import '${value}';`), []);
  for (const value of ['../records/browser/editor-session.ts', '../../src/index.ts', 'cordis', 'node:fs', 'fastify', 'vue-router', 'cordis-web-framework/http-json', 'cordis-web-framework/hosts/node']) assert.ok(violations(resolve(app, 'fixture.ts'), `import '${value}';`).length);
  const errors = readdirSync(app).filter(file => file.endsWith('.ts')).flatMap(file => violations(resolve(app, file), readFileSync(resolve(app, file), 'utf8')));
  assert.deepEqual(errors, []);
});
