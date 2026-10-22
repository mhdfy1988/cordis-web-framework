<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Component } from 'vue';
import type { UiAccess, UiContext } from 'cordis-web-framework/contracts/ui';
import { shellPositions } from './contracts.js';
import type { ShellOptions } from './contracts.js';
const props = defineProps<{ options: ShellOptions; outlet: Component; uiContext: UiContext; uiAccess: UiAccess }>();
const mobile = ref(false); const wide = ref(false); const asideOpen = ref(false); const root = ref<HTMLElement>();
let media: MediaQueryList | undefined;
const resize = () => { wide.value = media?.matches ?? false; };
onMounted(() => { media = matchMedia('(min-width:1280px)'); resize(); media.addEventListener('change', resize); });
onUnmounted(() => media?.removeEventListener('change', resize));
function focusContent() { root.value?.querySelector<HTMLElement>('main')?.focus(); }
function navigationClick(event: MouseEvent) { if ((event.target as Element).closest('a[href]')) mobile.value = false; }
</script>
<template>
  <div ref="root" class="default-shell" :data-variant="props.options.variant" @keydown.esc="mobile = false">
    <a class="shell-skip-link" :href="'#' + props.options.mainId" @click.prevent="focusContent">跳到正文</a>
    <header class="shell-header"><a class="shell-brand" :href="props.options.home">{{ props.options.title }}</a>
      <div class="shell-actions"><button class="shell-menu-button" :aria-expanded="mobile" :aria-controls="props.options.navigationId" @click="mobile = !mobile">{{ props.options.menuLabel }}</button>
        <component :is="props.outlet" :target="shellPositions.header" :context="props.uiContext" :access="props.uiAccess" />
      </div>
    </header>
    <button v-if="mobile" class="shell-backdrop" :aria-label="'关闭' + props.options.navigationLabel" @click="mobile = false" />
    <aside :id="props.options.navigationId" class="shell-navigation" :class="{ open: mobile }" :aria-label="props.options.navigationLabel" @click="navigationClick">
      <component :is="props.outlet" :target="shellPositions.navigation" :context="props.uiContext" :access="props.uiAccess" />
    </aside>
    <div class="shell-workspace" :class="{ 'without-aside': !props.options.aside }">
      <main :id="props.options.mainId" tabindex="-1"><component :is="props.outlet" :target="shellPositions.content" :context="props.uiContext" :access="props.uiAccess" /></main>
      <details v-if="props.options.aside" class="shell-aside" :open="wide || asideOpen" @toggle="event => { if (!wide) asideOpen = (event.target as HTMLDetailsElement).open; }">
        <summary>{{ props.options.asideLabel }}</summary><component :is="props.outlet" :target="shellPositions.aside" :context="props.uiContext" :access="props.uiAccess" />
      </details>
    </div>
    <div class="shell-overlays"><component :is="props.outlet" :target="shellPositions.overlays" :context="props.uiContext" :access="props.uiAccess" /></div>
  </div>
</template>
