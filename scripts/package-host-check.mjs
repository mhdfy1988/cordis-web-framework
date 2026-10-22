import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import Fastify from 'fastify';
import { runNode } from './run.mjs';

export async function checkHostConsumer(consumer) {
  runNode(['node-host.mjs'], { cwd: consumer });
  const bundle = await build({ absWorkingDir: consumer, entryPoints: ['host-browser.mjs'], bundle: true,
    platform: 'browser', format: 'iife', write: false, metafile: true });
  assert.ok(!Object.keys(bundle.metafile.inputs).some(input => /hosts[\\/]node|fastify|fluid-block|node-host\.mjs/.test(input)));
  const js = bundle.outputFiles[0].text;
  assert.ok(!js.includes('W2_SERVER_ONLY_SECRET'));
  const server = Fastify();
  server.get('/', (_request, reply) => reply.type('text/html').send('<!doctype html><html><head><meta charset="UTF-8"></head><body><script src="/host.js"></script></body></html>'));
  server.get('/host.js', (_request, reply) => reply.type('text/javascript').send(js));
  const address = await server.listen({ host: '127.0.0.1', port: 0 });
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    await page.goto(address);
    assert.equal(await page.evaluate(() => globalThis.w2Result), 'W2 isolated browser host passed');
    return { nodeHost: true, browserHost: true, realBrowser: true, chrome: browser.version(), platformIsolation: true };
  } finally { await browser?.close(); await server.close(); }
}
