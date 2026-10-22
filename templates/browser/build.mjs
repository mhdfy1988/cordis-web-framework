import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('web', { recursive: true });
for (const [entry, name] of [['main', 'app'], ['raster-worker', 'raster-worker']]) {
  await build({ entryPoints: [`app/${entry}.ts`], outfile: `web/${name}.js`, bundle: true, platform: 'browser', format: 'esm',
    target: 'es2022', minify: true, define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false', 'process.env.NODE_ENV': '"production"' } });
}
copyFileSync('app/index.html', 'web/index.html');
