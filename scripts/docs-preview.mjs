import { startDocsStatic } from './docs-static.mjs';
const host = await startDocsStatic(); console.log(`本地文档静态预览：${host.address}`);
const stop = async () => { await host.server.close(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
