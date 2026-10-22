import assert from 'node:assert/strict';
import { createSettingsStore } from '../application/management/settings.ts';
import { createPluginController } from '../application/management/controller.ts';
import { definePlugin } from 'cordis-web-framework/composition';
import { startPluginManager, createMemoryPluginStore } from 'cordis-web-framework/management';
import { createNodePluginLoader } from 'cordis-web-framework/hosts/node/plugins';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { zodConfig } from 'cordis-web-framework/validation-zod';
import { z } from 'zod';
const data = new Map<string,string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem(key: string, value: string) { data.set(key,value); } };
for (const bad of ['broken','{"formatVersion":2,"disabled":[],"variant":"sidebar"}','{"formatVersion":1,"disabled":["docs.foundation"],"variant":"sidebar"}']) {
  storage.setItem('bad',bad); assert.throws(()=>createSettingsStore(storage,'bad').read());
}
let starts = 0; let legacyReads = 0;
const plugin = definePlugin({ manifest: { id:'docs.outline',version:'1.0.0',apiVersion:'^1',requires:[],provides:[] },
 config:zodConfig(z.strictObject({}).prefault({})), setup(){ starts++; } });
const document={formatVersion:1 as const,plugins:[{id:'docs.outline',entry:'docs.outline',version:'1.0.0'}],bindings:{}};
const store=createMemoryPluginStore();
function controller() { return createPluginController({document,catalog:new Map([['docs.outline',plugin]]),store,loader:createNodePluginLoader(),
 legacySettings(){ legacyReads++; return {formatVersion:1,disabled:['docs.outline'],variant:'sidebar'}; }}); }
const first=controller();
const manager=await startPluginManager({...first.management,runtime:createCordisRuntime(),environment:{platform:'node',capabilities:[]}});
first.attach(manager);
assert.equal(starts,0,'迁移禁用项不能先激活再停用');
await first.toggle('docs.outline'); assert.equal(starts,1); await manager.close();
const next=controller();
const restored=await startPluginManager({...next.management,runtime:createCordisRuntime(),environment:{platform:'node',capabilities:[]}});
next.attach(restored);
assert.equal(next.state('docs.outline'),'ready'); assert.equal(legacyReads,1,'旧设置只读取一次，不能覆盖框架保存的启用意愿');
await restored.close();
console.log('旧设置严格校验、零激活迁移、一次性提交、重开以框架状态为准通过');
