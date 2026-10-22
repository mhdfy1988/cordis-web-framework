import { build } from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runNode } from './run.mjs';
export const vueDefines = { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', 'process.env.NODE_ENV': '"production"' };

export async function buildRecords() {
  const out = resolve(root, 'output/records-web'); mkdirSync(out, { recursive: true });
  const result = await build({ absWorkingDir: root, entryPoints: ['examples/records/browser/main.ts'],
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022', outfile: resolve(out, 'app.js'), metafile: true,
    define: vueDefines });
  if (Object.keys(result.metafile.inputs).some(input => /hosts[\\/]node|examples[\\/]records[\\/]server|fastify|node:sqlite/.test(input))) throw new Error('浏览器产物越过服务端边界');
  copyFileSync(resolve(root, 'examples/records/browser/index.html'), resolve(out, 'index.html'));
  writeFileSync(resolve(out, 'meta.json'), JSON.stringify(result.metafile, null, 2));
  return out;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runNode(['scripts/build.mjs']); await buildRecords();
}
