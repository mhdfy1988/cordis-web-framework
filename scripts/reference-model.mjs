import ts from 'typescript';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

/** 复用现有编译器解析公开声明和转导出，不用文本正则猜 TypeScript 签名。 */
export function renderReference(directory) {
  const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  const entries = Object.entries(pkg.exports);
  const files = entries.map(([, value]) => resolve(directory, value.types));
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
  const checker = program.getTypeChecker(); const inventory = {};
  const lines = ['# 公开 API 生成签名', '',
    '本文件由 `npm.cmd run docs:reference` 从当前 dist 的公开声明生成，不手工修改。行为、默认值及清理责任见 [API 参考](index.md)。', '',
    '以下按导入入口列出所有导出符号，包括转导出的接口／类型。每段是声明参考，不是单独可运行文件；关联类型在本页其他段落中查询。未列为公开导出的内部类型只在签名引用中出现，不因此变为公开入口。', ''];
  const index = readFileSync(resolve(directory, 'docs/reference/index.md'), 'utf8');
  for (const [entry, spec] of entries) {
    const importPath = entry === '.' ? pkg.name : pkg.name + entry.slice(1);
    assert.ok(index.includes('`' + importPath + '`'), `API 参考未覆盖入口：${importPath}`);
    const file = program.getSourceFile(resolve(directory, spec.types)); assert.ok(file, `缺少声明：${entry}`);
    const module = checker.getSymbolAtLocation(file); assert.ok(module, `声明不是模块：${entry}`);
    const exports = checker.getExportsOfModule(module).sort((a, b) => a.name.localeCompare(b.name));
    assert.ok(exports.length, `入口没有导出：${entry}`); inventory[entry] = exports.map(symbol => symbol.name);
    lines.push(`## ${importPath}`, '', `导出：${inventory[entry].map(name => '`' + name + '`').join('、')}。`, '');
    for (const exported of exports) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const declarations = symbol.getDeclarations() ?? []; assert.ok(declarations.length, `符号缺少声明：${entry}/${exported.name}`);
      const code = [...new Set(declarations.map(declaration => {
        // 变量声明自身没有 const 前缀，保留所属语句以提供可读类型。
        const node = ts.isVariableDeclaration(declaration) ? declaration.parent.parent : declaration;
        const path = relative(resolve(directory, 'dist'), node.getSourceFile().fileName);
        assert.ok(!path.startsWith('..'), `符号来源越过本包声明：${exported.name}`);
        return node.getText(node.getSourceFile()).replaceAll('\r\n', '\n');
      }))].join('\n');
      lines.push(`### ${exported.name}`, '', '```ts', code, '```', '');
    }
  }
  return { markdown: lines.join('\n'), inventory };
}
