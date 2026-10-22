import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodePackageRepository } from '../src/hosts/node/package-repository.ts';
import { createNpmFixture } from './npm-fixture.ts';

test('N6 实际 npm registry 协议：精确版本下载、锁记录、缺失版本及运行中取消', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cw-npm-registry-'));
  const fixture = await createNpmFixture(directory, 'registry-demo'); const bytes = await readFile(fixture.path);
  let address = ''; const abort = new AbortController(); let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    if (request.url?.startsWith('/slow-demo')) { abort.abort(); response.destroy(); return; }
    if (request.url?.startsWith('/registry-demo')) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ name: 'registry-demo', 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {
        ...fixture.json, dist: { tarball: address + '/artifact.tgz', integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') },
      } } })); return;
    }
    if (request.url === '/artifact.tgz') { response.end(bytes); return; }
    response.statusCode = 404; response.end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  address = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const repository = createNodePackageRepository({ directory: join(directory, 'library'), timeoutMs: 10000 });
  try {
    await repository.recover([]);
    const phases: string[] = [];
    const artifact = await repository.stage({ type: 'registry', name: 'registry-demo', version: '1.0.0', registry: address },
      { acceptTrustedCode: true, onProgress: phase => phases.push(phase) });
    assert.equal(artifact.source, `registry-demo@1.0.0 (${address}/)`); assert.equal(artifact.version, '1.0.0');
    assert.deepEqual(phases, ['installing', 'validating', 'stored']); assert.ok(requests > 0);
    assert.ok((await readFile(join(directory, 'library', artifact.key, 'package-lock.json'), 'utf8')).includes('/artifact.tgz'));
    await assert.rejects(repository.stage({ type: 'registry', name: 'registry-demo', version: '8.0.0', registry: address }, { acceptTrustedCode: true }), /退出码/);
    await assert.rejects(repository.stage({ type: 'registry', name: 'slow-demo', version: '1.0.0', registry: address }, { acceptTrustedCode: true, signal: abort.signal }), /取消/);
    assert.equal((await readdir(join(directory, 'library'))).filter(name => name.startsWith('pkg-')).length, 1);
    await repository.close();
    await mkdir(join(directory, 'library', 'pkg-Orphan'));
    await repository.recover([artifact]);
    assert.equal((await readdir(join(directory, 'library'))).includes('pkg-Orphan'), false);
    await repository.validate(artifact, { platform: 'node', capabilities: [] });
    await repository.remove(artifact);
  } finally { await repository.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
