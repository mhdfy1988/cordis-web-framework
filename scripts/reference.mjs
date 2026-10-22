import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './run.mjs';
import { renderReference } from './reference-model.mjs';
const target = resolve(root, 'docs/reference/signatures.md');
const result = renderReference(root);
if (process.argv[2] === 'write') writeFileSync(target, result.markdown);
else if (readFileSync(target, 'utf8') !== result.markdown) throw new Error('API 签名与当前声明不一致，请先 build，再执行 docs:reference 并审查变化');
console.log(`公开 API：${Object.keys(result.inventory).length} 个入口，${Object.values(result.inventory).reduce((n, list) => n + list.length, 0)} 个导出项（含转导出）`);
