<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { documentsKey, navigationKey } from '../services/contracts.ts';
import { required } from './context.ts';
import { pluginControllerKey } from '../management/context.ts';
const documents = required(documentsKey); const navigation = required(navigationKey);
const controller = required(pluginControllerKey);
const revision = ref(0); onUnmounted(navigation.subscribe(() => { revision.value++; }));
const current = computed(() => { revision.value; return navigation.current(); });
const groups = ['开始使用', '开发教程', 'API 参考', '使用与维护', '架构与研发记录'];
</script>
<template>
  <nav v-if="controller.variant.value === 'topbar'" class="topbar-chapters" @click="event => { if ((event.target as Element).closest('a')) (event.currentTarget as Element).querySelectorAll('details').forEach(item => { item.open = false; }); }" @keydown.esc="event => (event.currentTarget as Element).querySelectorAll('details').forEach(item => { item.open = false; })">
    <details v-for="group in groups" :key="group"><summary>{{ group }}</summary><div><a v-for="page in documents.manifest.pages.filter(item => item.group === group)" :key="page.id" :href="'#' + page.route">{{ page.title }}</a></div></details><a href="#/plugins">插件管理</a>
  </nav>
  <template v-else><nav><template v-for="group in groups" :key="group">
    <details v-if="group === '架构与研发记录'" class="navigation-group"><summary>{{ group }}</summary>
      <a v-for="page in documents.manifest.pages.filter(item => item.group === group)" :key="page.id" :href="'#' + page.route" :aria-current="current === page.id ? 'page' : undefined">{{ page.title }}</a>
    </details>
    <section v-else class="navigation-group"><h2>{{ group }}</h2>
      <a v-for="page in documents.manifest.pages.filter(item => item.group === group)" :key="page.id" :href="'#' + page.route" :aria-current="current === page.id ? 'page' : undefined">{{ page.title }}</a>
    </section>
  </template></nav>
  <div class="plugin-manager-link"><a href="#/plugins">插件管理</a></div>
  </template>
</template>
<style scoped>
.topbar-chapters { display:flex; flex-wrap:wrap; align-items:center; gap:12px 28px; font-size:13px; } .topbar-chapters details { position:relative; } .topbar-chapters summary { cursor:pointer; } .topbar-chapters details > div { position:absolute; z-index:40; top:30px; left:0; min-width:240px; max-width:calc(100vw - 64px); max-height:60vh; overflow:auto; padding:12px 16px; background:var(--cw-background,#fff); border:1px solid var(--cw-border,#e2e2e5); border-radius:8px; box-shadow:0 8px 24px #0002; } .topbar-chapters a { display:block; padding:4px 0; overflow-wrap:anywhere; }
@media(max-width:959px) { .topbar-chapters { display:block; } .topbar-chapters details { margin:16px 0; } .topbar-chapters details > div { position:static; min-width:0; max-height:none; box-shadow:none; margin-top:8px; } }
</style>
