import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { packageDigest, validateBrowserPackage, validatePackageDeclaration } from 'cordis-web-framework/management';

const json = JSON.parse(await readFile('package.json', 'utf8'));
const declaration = validatePackageDeclaration(json.cordisWeb);
// Node 产物保留多个文件与普通 npm 依赖；浏览器产物独立构建，不携带宿主运行时。
await build({ entryPoints: ['src/index.ts', 'src/helper.ts'], bundle: false, format: 'esm', platform: 'node', outdir: 'dist' });
const browser = await build({ entryPoints: ['src/browser.ts'], outfile: 'dist/browser.js', bundle: true,
  format: 'esm', platform: 'browser', metafile: true });
if (Object.values(browser.metafile.outputs).some(output => output.imports.length)
  || Object.keys(browser.metafile.inputs).some(path => /node_modules[\\/](?:vue|@vue|cordis)(?:[\\/]|$)/.test(path))) throw new Error('浏览器入口不能外部导入或捆绑宿主运行时');
const content = { formatVersion: 1, name: json.name, declaration,
  code: await readFile(declaration.entries.browser, 'utf8'), assets: {
    icon: { type: 'image/svg+xml', base64: (await readFile('assets/icon.svg')).toString('base64') },
  } };
const portable = await validateBrowserPackage({ ...content, integrity: await packageDigest(content) });
await writeFile('browser-plugin.json', JSON.stringify(portable, null, 2));
console.log('Node 多文件产物和浏览器交付文件已生成；npm pack 可独立交付标准包');
