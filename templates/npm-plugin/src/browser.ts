import { message } from './helper.js';
import type { PluginManifest, RegisteredPlugin } from 'cordis-web-framework';
export default (manifest: PluginManifest): RegisteredPlugin => ({ manifest,
  prepare: () => ({ ok: true, value(scope) { scope.provide({ id: 'example.greeting' }, { message }); } }),
});
