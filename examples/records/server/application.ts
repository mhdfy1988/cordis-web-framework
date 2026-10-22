import { z } from 'zod';
import { definePlugin } from 'cordis-web-framework/composition';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { startNodeHost } from 'cordis-web-framework/hosts/node';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { defineJsonEndpoint, ApiError } from 'cordis-web-framework/http-json';
import type { StaticAsset } from 'cordis-web-framework/contracts/http';
import type { Logger } from 'cordis-web-framework/logging';
import { repositoryKey, identityKey, recordsKey, type IdentityProvider, type RecordService } from './contracts.ts';
import { openRecordRepository } from './sqlite-repository.ts';
import { createFixtureIdentity } from './fixture-identity.ts';
import { createRecordService, type RecordHooks } from './record-service.ts';
import { listOperation, saveOperation, sessionOperation } from '../shared/protocol.ts';

export async function startRecordsApplication(options: {
  readonly databaseFile: string;
  readonly localDemo: true;
  readonly logger?: Logger;
  readonly assets?: readonly StaticAsset[];
  readonly hooks?: RecordHooks;
}) {
  if (options.localDemo !== true) throw new Error('必须显式启用本地身份夹具');
  const empty = zodConfig(z.strictObject({}).default({}));
  const manifest = (id: string, requires: string[], provides: string[]) => ({ id, version: '1.0.0', apiVersion: '^1',
    requires: requires.map(id => ({ id, range: '^1' })), provides: provides.map(id => ({ id, version: '1.0.0' })),
    host: { platforms: ['node'] as const, capabilities: ['http'] } });
  const storage = definePlugin({ manifest: manifest('records.storage', [], [repositoryKey.id]), config: empty, setup(scope) {
    const repository = openRecordRepository(options.databaseFile);
    scope.onDispose(() => repository.close()); scope.provide(repositoryKey, repository);
  } });
  const identity = definePlugin({ manifest: manifest('records.identity', [], [identityKey.id]), config: empty, setup(scope) {
    const provider = createFixtureIdentity(); scope.onDispose(() => provider.close()); scope.provide(identityKey, provider);
  } });
  const service = definePlugin({ manifest: manifest('records.service', [repositoryKey.id], [recordsKey.id]), config: empty, setup(scope) {
    scope.provide(recordsKey, createRecordService(scope.get(repositoryKey), options.hooks));
  } });
  // HTTP 贡献是显式桥接；处理器不读取 Cordis 私有上下文，也不使用全局当前用户。
  let bridge: { identity: IdentityProvider; service: RecordService } | undefined;
  const api = definePlugin({ manifest: manifest('records.api', [identityKey.id, recordsKey.id], []), config: empty, setup(scope) {
    bridge = { identity: scope.get(identityKey), service: scope.get(recordsKey) };
    scope.onDispose(() => { bridge = undefined; });
  } });
  const current = () => { if (!bridge) throw new ApiError('unavailable'); return bridge; };
  const endpoints = [
    defineJsonEndpoint(sessionOperation, (_context, input) => current().identity.issue(input.mode)),
    defineJsonEndpoint(listOperation, context => {
      const app = current(); return app.service.list(app.identity.authenticate(context.credential));
    }),
    defineJsonEndpoint(saveOperation, (context, input) => {
      const app = current(); return app.service.save(context, app.identity.authenticate(context.credential), input);
    }),
  ];
  const modules = [storage, identity, service, api];
  return startNodeHost({ hostname: '127.0.0.1', document: { formatVersion: 1,
    plugins: modules.map(module => ({ id: module.manifest.id, version: '1.0.0', entry: module.manifest.id })),
    bindings: { [repositoryKey.id]: 'records.storage', [identityKey.id]: 'records.identity', [recordsKey.id]: 'records.service' } },
    catalog: new Map(modules.map(module => [module.manifest.id, module])), createRuntime: createCordisRuntime,
    api: endpoints, logger: options.logger, assets: options.assets });
}
