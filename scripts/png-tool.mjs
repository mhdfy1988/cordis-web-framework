import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runNode, runNpm } from './run.mjs';
import { preparePngConsumer, frameworkDigest } from './png-build.mjs';
import { checkPngConsumer } from './package-png-check.mjs';

runNode(['scripts/build.mjs']);
const before = frameworkDigest(); const output = resolve(root, 'output'); mkdirSync(output, { recursive: true });
const packed = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', output], { encoding: 'utf8', stdio: 'pipe' }).stdout)[0];
if (process.argv[2] === 'check') {
  const report = await checkPngConsumer(resolve(output, packed.filename));
  if (report.integrity !== packed.integrity) throw new Error('消费包摘要不一致');
  console.log('W5 工程外纯浏览器工具、静态子路径、PNG 回读和资源清理通过');
} else {
  const built = await preparePngConsumer(resolve(output, packed.filename));
  if (built.tarballIntegrity !== packed.integrity) throw new Error('消费包摘要不一致');
  const destination = resolve(output, 'png-tool'); cpSync(built.out, destination, { recursive: true });
  if (before !== frameworkDigest()) throw new Error('跨应用验证不应修改框架 src');
  writeFileSync(resolve(output, 'png-build-result.json'), JSON.stringify({
    builtOnly: true, consumer: built.consumer, tarball: resolve(output, packed.filename), integrity: built.tarballIntegrity,
    assets: built.hashes, frameworkSourceSha256: before, frameworkSourceUnchanged: true, independentConsumer: true,
    omitDev: true, ignoreScripts: true, nodeNext: true, vueRouterInstalled: false, staticOutput: destination,
    sourceLockSha256: (await import('node:crypto')).createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex'),
  }, null, 2));
  console.log(`纯静态工具已从包消费构建：${destination}`);
}
