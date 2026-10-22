import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { root, runNpm, runNode } from './run.mjs';
import { json, digest } from './delivery-policy.mjs';
import { checkPngBrowser } from './png-check-shared.mjs';

export function exportTemplates(kit, tarball) {
  const pkg = json(resolve(root, 'package.json'));
  mkdirSync(kit, { recursive: true }); cpSync(tarball, resolve(kit, 'framework.tgz'));
  for (const kind of ['browser', 'node', 'fullstack']) {
    const destination = resolve(kit, 'templates', kind);
    cpSync(resolve(root, 'templates', kind), destination, { recursive: true });
    if (kind === 'browser') cpSync(resolve(root, 'examples/png-resizer'), resolve(destination, 'app'), { recursive: true });
    if (kind === 'fullstack') cpSync(resolve(root, 'examples/records'), resolve(destination, 'app'), { recursive: true });
    const dependencies = { [pkg.name]: 'file:../../framework.tgz', zod: pkg.dependencies.zod };
    if (kind !== 'node') dependencies.vue = pkg.devDependencies.vue;
    writeFileSync(resolve(destination, 'package.json'), JSON.stringify({ name: `local-${kind}-starter`, private: true, license: pkg.license, type: 'module',
      engines: pkg.engines, scripts: kind === 'browser' ? { build: 'node build.mjs' } : kind === 'node' ? { start: 'node start.mjs' } : { build: 'node build.mjs', start: 'node start.mjs' },
      dependencies, ...(kind === 'node' ? {} : { devDependencies: { esbuild: pkg.devDependencies.esbuild } }) }, null, 2));
    writeFileSync(resolve(destination, 'README.md'), `# ${kind} 应用模板\n\n需要 Node ${pkg.engines.node}、npm 11.9.0。从本目录执行 npm.cmd ci --ignore-scripts --no-audit --no-fund。\n\n${kind === 'node' ? '执行 npm.cmd start，访问日志地址的 /health/ready。' : '执行 npm.cmd run build。' + (kind === 'browser' ? '将 web 内四个文件放到 HTTP(S) 静态目录，保留相对路径及 JavaScript MIME。需要支持 Worker、OffscreenCanvas 的浏览器；不可用时显式报错。' : '再执行 npm.cmd start，以 Chrome 访问日志地址。数据在本目录 data，退出使用 Ctrl+C。身份只是本机夹具，不可直接部署公网。')}\n\n必须连同 ../../framework.tgz 一起搬移，附带本候选实际验收的锁文件。框架通过 GitHub Release 交付，不从 npm 下载同名包代替。自有代码采用 MIT，保留 LICENSE 与第三方声明。\n`);
  }
  cpSync(resolve(root, 'templates/plugin'), resolve(kit, 'templates/plugin'), { recursive: true });
  cpSync(resolve(root, 'templates/npm-plugin'), resolve(kit, 'templates/npm-plugin'), { recursive: true });
  return digest(resolve(kit, 'framework.tgz'));
}

export async function checkTemplates(kit, output) {
  // 整体搬到工程外再安装，脚本只能依赖导出的模板及其本地 npm 依赖。
  const consumer = mkdtempSync(resolve(tmpdir(), 'cordis-w6-delivery-'));
  cpSync(kit, consumer, { recursive: true });
  const report = { consumer, tarballSha256: digest(resolve(consumer, 'framework.tgz')) };
  for (const kind of ['node', 'browser', 'fullstack']) {
    const directory = resolve(consumer, 'templates', kind);
    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: directory });
    runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: directory });
    assert.equal(json(resolve(directory, 'node_modules/cordis-web-framework/package.json')).version, json(resolve(root, 'package.json')).version);
    // 锁的实际本地包完整性必须相同，不只比较 0.0.0 版本字符串。
    const installed = json(resolve(directory, 'package-lock.json')).packages['node_modules/cordis-web-framework'];
    assert.ok(installed.integrity, '模板锁必须记录 tarball 完整性');
    cpSync(resolve(directory, 'package-lock.json'), resolve(kit, 'templates', kind, 'package-lock.json'));
    if (kind === 'node') {
      runNode(['--input-type=module', '-e', `import assert from 'node:assert/strict'; import {startApplication} from './application.mjs';
        const host=await startApplication(); try { assert.equal((await fetch(host.address+'/health/ready')).status,200); }
        finally { assert.equal((await host.stop()).state,'stopped'); }`], { cwd: directory });
      report.node = { health: true, stopped: true, integrity: installed.integrity };
    } else {
      runNpm(['run', 'build'], { cwd: directory });
      if (kind === 'browser') report.browser = { ...await checkPngBrowser(resolve(directory, 'web'), resolve(output, 'template-png')), integrity: installed.integrity };
      else {
        // application 的相对资源来自模板 cwd；用独立子进程避免改变整个检查器的工作目录。
        const fixture = resolve(root, 'tests/template-fullstack-check.mjs');
        cpSync(fixture, resolve(directory, 'acceptance.mjs'));
        // 测试浏览器依赖仅在隔离验收中显式提供，不进入模板生产依赖。
        const browserModule = pathToFileURL(resolve(root, 'node_modules/playwright/index.mjs')).href;
        runNode(['acceptance.mjs', browserModule], { cwd: directory });
        report.fullstack = { realBrowserSave: true, databaseReadback: true, stopped: true, integrity: installed.integrity };
      }
    }
  }
  const producer = resolve(consumer, 'templates/plugin');
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  runNpm(['run', 'build'], { cwd: producer });
  cpSync(resolve(producer, 'package-lock.json'), resolve(kit, 'templates/plugin/package-lock.json'));
  report.plugin = { integrity: json(resolve(producer, 'package-lock.json')).packages['node_modules/cordis-web-framework'].integrity,
    artifactProduced: !!json(resolve(producer, 'plugin.cwplugin.json')).integrity };
  assert.equal(report.node.integrity, report.plugin.integrity);
  const npmProducer = resolve(consumer, 'templates/npm-plugin');
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: npmProducer });
  runNpm(['run', 'build'], { cwd: npmProducer }); runNpm(['run', 'check'], { cwd: npmProducer });
  cpSync(resolve(npmProducer, 'package-lock.json'), resolve(kit, 'templates/npm-plugin/package-lock.json'));
  report.npmPlugin = { integrity: json(resolve(npmProducer, 'package-lock.json')).packages['node_modules/cordis-web-framework'].integrity,
    npmPackageLifecycle: true };
  assert.equal(report.node.integrity, report.npmPlugin.integrity);
  assert.equal(report.node.integrity, report.browser.integrity); assert.equal(report.node.integrity, report.fullstack.integrity);
  return report;
}
