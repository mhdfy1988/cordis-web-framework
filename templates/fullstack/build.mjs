import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('web', { recursive: true });
await build({ entryPoints: ['app/browser/main.ts'], outfile: 'web/app.js', bundle: true, platform: 'browser', format: 'esm',
  target: 'es2022', minify: true, define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', 'process.env.NODE_ENV': '"production"' } });
copyFileSync('app/browser/index.html', 'web/index.html');
