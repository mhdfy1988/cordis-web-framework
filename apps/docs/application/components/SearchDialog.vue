<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { searchKey } from '../services/contracts.ts';
import { required } from './context.ts';
const search = required(searchKey); const dialog = ref<HTMLDialogElement>(); const input = ref<HTMLInputElement>(); let trigger: HTMLElement | null;
watch(search.open, async value => {
  await nextTick(); if (value) { trigger = document.activeElement as HTMLElement; dialog.value?.showModal(); input.value?.focus(); }
  else { dialog.value?.close(); trigger?.focus(); }
});
function close() { search.close(); }
function keys(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key === 'ArrowDown') { event.preventDefault(); dialog.value?.querySelector<HTMLAnchorElement>('a')?.focus(); }
}
</script>
<template><dialog ref="dialog" class="search-dialog" aria-label="搜索文档" @keydown="keys" @cancel.prevent="close" @click="event => { if (event.target === dialog) close(); }">
  <form method="dialog" @submit.prevent="close"><label for="document-search">搜索文档</label><div class="search-input-row"><input id="document-search" ref="input" v-model="search.query.value" type="search" autocomplete="off" @input="search.queryChanged"><button @click="close">关闭</button></div></form>
  <p v-if="search.error.value" role="alert">{{ search.error.value }}</p><p v-else-if="search.query.value && !search.results.value.length">没有找到相关文档</p>
  <nav aria-label="搜索结果"><a v-for="result in search.results.value" :key="result.id" :href="'#' + result.route" @click="close">{{ result.title }}</a></nav>
</dialog></template>
