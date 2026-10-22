import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './run.mjs';
import { preparePngConsumer, frameworkDigest } from './png-build.mjs';
import { checkPngBrowser } from './png-check-shared.mjs';

export async function checkPngConsumer(tarball) {
  const before = frameworkDigest(); const built = await preparePngConsumer(tarball);
  const output = resolve(root, 'output'); mkdirSync(output, { recursive: true });
  const result = await checkPngBrowser(built.out, resolve(output, 'png-check'));
  if (before !== frameworkDigest()) throw new Error('跨应用验证不应修改框架 src');
  const destination = resolve(output, 'png-tool'); cpSync(built.out, destination, { recursive: true });
  const report = { ...result, consumer: built.consumer, tarball, integrity: built.tarballIntegrity, assets: built.hashes,
    frameworkSourceSha256: before, frameworkSourceUnchanged: true, independentConsumer: true, omitDev: true, ignoreScripts: true,
    nodeNext: true, vueRouterInstalled: false, staticOutput: destination,
    sourceLockSha256: createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex') };
  writeFileSync(resolve(output, 'png-check-result.json'), JSON.stringify(report, null, 2)); return report;
}
