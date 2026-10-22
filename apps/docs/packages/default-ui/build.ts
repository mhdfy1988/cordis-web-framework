import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = dirname(fileURLToPath(import.meta.url));
export async function buildDefaultUi() {
  await build({ configFile: false, root, plugins: [vue()], publicDir: false,
    build: { outDir: resolve(root, 'dist'), emptyOutDir: true, target: 'es2022',
      lib: { entry: resolve(root, 'src/index.ts'), formats: ['es'], fileName: 'index', cssFileName: 'default-ui' },
      rollupOptions: { external: [/^vue(?:\/|$)/, /^zod(?:\/|$)/, /^cordis-web-framework(?:\/|$)/] } } });
  const require = createRequire(import.meta.url);
  const result = spawnSync(process.execPath, [require.resolve('vue-tsc/bin/vue-tsc.js'), '-p', resolve(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit', windowsHide: true });
  assert.equal(result.status, 0, '默认界面插件声明构建失败');
  // CSS 为独立公开入口，不让类型入口引用不存在的同名样式文件。
  copyFileSync(resolve(root, 'src/style.css'), resolve(root, 'dist/default-ui.css'));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildDefaultUi();
