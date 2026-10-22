import { service } from 'cordis-web-framework';
import type { UiRegistry } from 'cordis-web-framework/ui';
import type { CommandRegistry } from 'cordis-web-framework/commands';
import type { VueNavigation } from 'cordis-web-framework/presentation-vue/routing';
import type { InjectionKey, Ref, ShallowRef } from 'vue';
import type { DocumentPage, SiteManifest, PageMeta } from '../shared/documents.ts';
import { defaultThemeService } from '@cordis-web/default-ui';
import type { DefaultTheme } from '@cordis-web/default-ui';
export interface DocumentSession {
  readonly state: ShallowRef<{ status: 'loading' | 'ready' | 'error'; page?: DocumentPage; error?: string }>;
  select(meta: PageMeta | undefined): Promise<void>; close(): void;
}
export interface Documents { readonly manifest: SiteManifest; readonly session: DocumentSession }
export interface Search {
  readonly open: Ref<boolean>; readonly query: Ref<string>; readonly results: ShallowRef<{ id: string; title: string; route: string }[]>;
  readonly error: Ref<string>; show(): Promise<void>; close(): void; queryChanged(): void; dispose(): void;
}
export type Preferences = DefaultTheme;
export interface Clipboard { readonly message: Ref<string>; copy(text: string): Promise<void>; close(): void }
export const uiService = service<UiRegistry>('docs.ui');
export const commandService = service<CommandRegistry>('docs.commands');
export const navigationService = service<VueNavigation>('docs.navigation');
export const documentService = service<Documents>('docs.documents');
export const searchService = service<Search>('docs.search');
export const preferencesService = defaultThemeService;
export const clipboardService = service<Clipboard>('docs.clipboard');
export const documentsKey: InjectionKey<Documents> = Symbol('documents');
export const navigationKey: InjectionKey<VueNavigation> = Symbol('navigation');
export const commandsKey: InjectionKey<CommandRegistry> = Symbol('commands');
export const searchKey: InjectionKey<Search> = Symbol('search');
export const preferencesKey: InjectionKey<Preferences> = Symbol('preferences');
export const clipboardKey: InjectionKey<Clipboard> = Symbol('clipboard');
