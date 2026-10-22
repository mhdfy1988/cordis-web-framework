import { readFileSync } from 'node:fs';
import { serveDocumentation } from './static-server.ts';
import { verifyBuild } from './integrity.ts';
const build = JSON.parse(readFileSync('output/full-site-build.json', 'utf8')) as { outDir: string; base: string; inputs: Record<string, string>; artifacts: Record<string, string> };
verifyBuild(build);
const server = await serveDocumentation(build.outDir, build.base);
console.log(`完整文档站独立预览：${server.url}`);
for (const event of ['SIGINT', 'SIGTERM'] as const) process.once(event, () => { void server.close(); });
