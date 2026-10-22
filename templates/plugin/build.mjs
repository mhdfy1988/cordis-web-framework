import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { z } from 'zod';
import { artifactIntegrity, validateArtifact } from 'cordis-web-framework/management';

const file = z.string().min(1).max(1024);
const schema = z.strictObject({ manifest: z.unknown(), entries: z.strictObject({ browser: file.optional(), node: file.optional() }),
  assets: z.array(z.strictObject({ id: z.string(), type: z.enum(['text/css', 'text/plain']), file })).max(64).default([]) });
export async function buildPlugin(directory, destination = resolve(directory, 'plugin.cwplugin.json')) {
  const spec = schema.parse(JSON.parse(readFileSync(resolve(directory, 'plugin.json'), 'utf8')));
  const entries = {};
  for (const platform of ['browser', 'node']) if (spec.entries[platform]) {
    const result = await build({ absWorkingDir: directory, entryPoints: [spec.entries[platform]], bundle: true, write: false,
      format: 'esm', platform, target: 'es2022', metafile: true, legalComments: 'inline' });
    if (Object.values(result.metafile.outputs).some(output => output.imports.length)
      || Object.keys(result.metafile.inputs).some(input => /node_modules[\\/](?:cordis|vue|@vue)(?:[\\/]|$)/.test(input))) {
      throw new Error('插件必须自包含，不能留下外部导入或捆绑宿主运行库；请改用声明服务');
    }
    entries[platform] = result.outputFiles[0].text;
  }
  const content = { formatVersion: 1, manifest: spec.manifest, entries,
    assets: spec.assets.map(asset => ({ id: asset.id, type: asset.type, source: readFileSync(resolve(directory, asset.file), 'utf8') })) };
  const artifact = await validateArtifact({ ...content, integrity: await artifactIntegrity(content) });
  mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, JSON.stringify(artifact, null, 2));
  return { destination, integrity: artifact.integrity };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(await buildPlugin(import.meta.dirname));
}
