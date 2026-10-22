import { resolve } from 'node:path';
import { root } from './run.mjs';
import { startPngStatic } from './png-static.mjs';
const { server, address } = await startPngStatic(resolve(root, 'output/png-tool'));
console.log(`PNG tool: ${address}`);
let closing;
const close = () => { closing ??= server.close(); void closing.catch(() => { process.exitCode = 1; }); };
process.once('SIGINT', close); process.once('SIGTERM', close);
