import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runNode } from './run.mjs';
import { vueDefines } from './records-build.mjs';

export async function uiWorkspaceAssets(directory = root, sample = 'examples/ui-workspace', contract = 'tests/ui-browser-fixture.ts') {
  const assets = [{ path: '/', contentType: 'text/html; charset=utf-8', content: readFileSync(resolve(directory, sample, 'index.html'), 'utf8') }];
  const allInputs = new Set();
  for (const [name, entry] of [['app', `${sample}/main.ts`], ['workspace', `${sample}/application.ts`], ['contracts', contract]]) {
    const result = await build({ absWorkingDir: directory, entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm',
      target: 'es2022', outfile: resolve(directory, 'web', `${name}.js`), write: false, metafile: true, define: vueDefines });
    for (const input of Object.keys(result.metafile.inputs)) {
      if (/hosts[\\/]node|records[\\/]server|fastify|node:sqlite|fluid-block/.test(input)) throw new Error('界面产物跨越平台或项目边界');
      allInputs.add(input);
    }
    if (Object.values(result.metafile.outputs).some(file => file.imports.some(item => item.external))) throw new Error('界面浏览器产物仍有未解析依赖');
    for (const output of result.outputFiles) assets.push({ path: `/${output.path.endsWith('.css') ? `${name}.css` : `${name}.js`}`,
      contentType: output.path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', content: output.text });
  }
  return { assets, inputs: [...allInputs] };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runNode(['scripts/build.mjs']); const result = await uiWorkspaceAssets();
  const out = resolve(root, 'output/ui-workspace'); mkdirSync(out, { recursive: true });
  for (const asset of result.assets) writeFileSync(resolve(out, asset.path === '/' ? 'index.html' : asset.path.slice(1)), asset.content);
  writeFileSync(resolve(out, 'inputs.json'), JSON.stringify(result.inputs, null, 2));
}
