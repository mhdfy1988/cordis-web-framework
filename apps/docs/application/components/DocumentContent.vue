<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import type { UiContext, UiAccess } from 'cordis-web-framework/contracts/ui';
import { documentsKey, navigationKey } from '../services/contracts.ts';
import { required, outletKey } from './context.ts';
const props = defineProps<{ uiContext: UiContext; uiAccess: UiAccess }>();
const documents = required(documentsKey); const navigation = required(navigationKey); const Outlet = required(outletKey);
const revision = ref(0); onUnmounted(navigation.subscribe(() => { revision.value++; }));
const current = computed(() => { revision.value; return navigation.current(); });
watch(() => [documents.session.state.value.page?.id, revision.value], async () => {
  await nextTick(); const section = new URLSearchParams(location.hash.split('?')[1]).get('section');
  if (section) document.getElementById(section)?.scrollIntoView(); else window.scrollTo(0, 0);
}, { immediate: true });
</script>
<template>
  <section v-if="!current && documents.session.state.value.status === 'error'" role="alert"><h1>文档不存在</h1><a href="#/">返回首页</a></section>
  <Outlet v-else target="docs.body" :context="props.uiContext" :access="props.uiAccess" :entry-key="current" />
</template>
