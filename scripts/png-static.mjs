import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
/** 仅提供固定静态文件，不接受文件上传，不装载数据库或任何业务 API。 */
export async function startPngStatic(directory, prefix = '/tools/png/') {
  if (!/^\/(?:[a-z-]+\/)+$/.test(prefix)) throw new Error('静态子路径无效');
  const server = Fastify();
  const types = { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'app.css': 'text/css; charset=utf-8', 'raster-worker.js': 'text/javascript; charset=utf-8' };
  server.addHook('onRequest', (_request, reply, done) => {
    reply.header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; worker-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'");
    reply.header('X-Content-Type-Options', 'nosniff'); done();
  });
  for (const [file, type] of Object.entries(types)) {
    const content = readFileSync(resolve(directory, file));
    server.get(file === 'index.html' ? prefix : `${prefix}${file}`, (_request, reply) => reply.type(type).send(content));
  }
  const origin = await server.listen({ host: '127.0.0.1', port: 0 });
  return { server, address: `${origin}${prefix}`, origin, prefix };
}
