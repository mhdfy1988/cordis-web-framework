import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runPackageCommand } from '../src/hosts/node/package-command.ts';

export async function createNpmFixture(directory: string, id = 'npm-greeting', vueClient = false) {
  const source = join(directory, id); await mkdir(join(source, 'dist'), { recursive: true }); await mkdir(join(source, 'assets'));
  const tarballs = JSON.parse(await runPackageCommand(['pack', resolve('node_modules/semver'), '--ignore-scripts', '--json', '--pack-destination', directory], directory, {}));
  const dependency = join(directory, tarballs[0].filename);
  const manifest = { id, version: '1.0.0', apiVersion: '^1', requires: [], provides: [{ id: 'npm.greeting', version: '1.0.0' }] };
  const json = { name: id, version: '1.0.0', type: 'module', files: ['dist', 'assets'], dependencies: { semver: 'file:' + dependency },
    scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'UNSAFE_SCRIPT\',\'bad\')"' },
    cordisWeb: { formatVersion: 1, manifest, entries: { node: 'dist/index.js', browser: 'dist/client.js' }, assets: { icon: 'assets/icon.svg', css: 'assets/style.css' }, shared: vueClient ? ['vue'] : [] } };
  await writeFile(join(source, 'package.json'), JSON.stringify(json));
  await writeFile(join(source, 'dist/helper.js'), 'export const greeting = "独立多文件插件";');
  await writeFile(join(source, 'dist/index.js'), `import { greeting } from './helper.js'; import semver from 'semver';
    globalThis.__npmImports = (globalThis.__npmImports || 0) + 1;
    export default (manifest, { assets }) => ({ manifest, prepare: () => ({ok:true, value(scope) {
      globalThis.__npmEvents?.push(greeting + semver.valid('1.0.0'));
      scope.provide({id:'npm.greeting'}, {greeting, assets}); scope.onDispose(() => { globalThis.__npmEvents?.push('released'); });
    }}) });`);
  await writeFile(join(source, 'dist/client.js'), `export default (manifest, { assets, shared }) => ({manifest,prepare:()=>({ok:true,value(scope){
    const box = document.createElement('section'); box.id='npm-demo';
    box.innerHTML='<p>标准 npm 插件</p><img alt="插件图标"><style></style>';
    box.querySelector('img').src=assets.icon; fetch(assets.css).then(r=>r.text()).then(css=>{if(box.isConnected)box.querySelector('style').textContent=css});
    document.querySelector('#plugin-content').append(box); scope.provide({id:'npm.greeting'},{text:'标准 npm 插件'}); scope.onDispose(()=>box.remove());
  }})});`);
  if (vueClient) await writeFile(join(source, 'dist/client.js'), `export default (manifest,{assets,shared})=>({manifest,prepare:()=>({ok:true,value(scope){
    const {createApp,h,ref}=shared.vue; const css=ref(''); const abort=new AbortController();
    const mount=document.createElement('div'); document.querySelector('#plugin-content').append(mount);
    const app=createApp({render:()=>h('section',{id:'npm-demo'},[h('p','标准 npm 插件'),h('img',{src:assets.icon,alt:'插件图标'}),h('style',css.value)])}); app.mount(mount);
    fetch(assets.css,{signal:abort.signal}).then(r=>r.text()).then(text=>css.value=text).catch(error=>{if(error.name!=='AbortError')throw error});
    scope.provide({id:'npm.greeting'},{text:'标准 npm 插件'}); scope.onDispose(()=>{abort.abort();app.unmount();mount.remove()});
  }})});`);
  await writeFile(join(source, 'assets/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2563eb"/></svg>');
  await writeFile(join(source, 'assets/style.css'), '#npm-demo { color: rgb(45, 67, 89); padding: 12px; }');
  const packed = JSON.parse(await runPackageCommand(['pack', source, '--ignore-scripts', '--json', '--pack-destination', directory], directory, {}));
  return { path: join(directory, packed[0].filename), source, json, read: () => readFile(join(source, 'package.json'), 'utf8') };
}
