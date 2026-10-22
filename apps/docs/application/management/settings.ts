import { z } from 'zod';


export const optionalGroups: Readonly<Record<string, readonly string[]>> = {
  'ui.default-theme': ['ui.default-theme', 'docs.theme-control'],
  'docs.search': ['docs.search', 'docs.header'],
  'docs.outline': ['docs.outline'],
  'ui.default-layout': ['ui.default-layout'],
};
const groupIds = Object.keys(optionalGroups) as [string, ...string[]];
const schema = z.strictObject({ formatVersion: z.literal(1), disabled: z.array(z.enum(groupIds)).max(groupIds.length).refine(ids => new Set(ids).size === ids.length), variant: z.enum(['sidebar', 'topbar']) });
export type PluginSettings = z.infer<typeof schema>;
export interface SettingsStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function createSettingsStore(storage: SettingsStorage, key: string) {
  return {
    read(): PluginSettings {
      const text = storage.getItem(key);
      // 只有没有保存配置才采用首次默认值；坏配置明确拒绝，不能悄悄全部启用。
      return text === null ? { formatVersion: 1, disabled: [], variant: 'sidebar' } : schema.parse(JSON.parse(text));
    },
  };
}
