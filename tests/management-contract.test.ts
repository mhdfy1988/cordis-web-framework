import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactIntegrity, validateArtifact } from '../src/plugin-management/artifact.ts';
import { installationDocumentValidator } from '../src/validation-zod/management.ts';

test('P2 包契约：完整性、平台、版本、资源和未知字段严格校验', async () => {
  const content = { formatVersion: 1 as const, manifest: { id: 'sample', version: '1.0.0', apiVersion: '^1.0.0', requires: [], provides: [] },
    entries: { node: 'export default manifest => ({manifest, prepare: () => ({ok:true,value(){}})})' }, assets: [] };
  const artifact = { ...content, integrity: await artifactIntegrity(content) };
  assert.equal((await validateArtifact(artifact, { platform: 'node', capabilities: [] })).manifest.id, 'sample');
  for (const value of [{ ...artifact, extra: true }, { ...artifact, entries: {} }, { ...artifact, integrity: '0'.repeat(64) },
    { ...artifact, assets: [{ id: '../escape', type: 'text/plain', source: '' }] }, { ...artifact, manifest: { ...content.manifest, apiVersion: '^2' } }]) {
    await assert.rejects(validateArtifact(value));
  }
  await assert.rejects(validateArtifact(artifact, { platform: 'browser', capabilities: [] }), /宿主/);
});
test('P2 持久契约：启用意愿不包含 ready，旧版本、重复身份和非法配置明确拒绝', () => {
  const record = { id: 'sample', version: '1.0.0', enabled: true, config: {}, bindings: {} };
  assert.equal(installationDocumentValidator.validate({ formatVersion: 1, revision: 0, plugins: [record] }).ok, true);
  for (const input of [{ formatVersion: 2, revision: 0, plugins: [] }, { formatVersion: 1, revision: 0, plugins: [record, record] },
    { formatVersion: 1, revision: 0, plugins: [{ ...record, ready: true }] }]) assert.equal(installationDocumentValidator.validate(input).ok, false);
});
