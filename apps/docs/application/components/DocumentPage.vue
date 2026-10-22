<script setup lang="ts">
import { computed } from 'vue';
import { documentsKey, clipboardKey } from '../services/contracts.ts';
import { required } from './context.ts';
const documents = required(documentsKey); const clipboard = required(clipboardKey);
const state = computed(() => documents.session.state.value);
const index = computed(() => documents.manifest.pages.findIndex(page => page.id === state.value.page?.id));
const previous = computed(() => documents.manifest.pages[index.value - 1]); const next = computed(() => documents.manifest.pages[index.value + 1]);
function copy(event: MouseEvent) {
  const button = (event.target as Element).closest('button.copy'); if (!button) return;
  const text = button.parentElement?.querySelector('pre code')?.textContent; if (text !== undefined) void clipboard.copy(text);
}
</script>
<template>
  <p v-if="state.status === 'loading'" role="status">正在读取文档…</p>
  <section v-else-if="state.status === 'error'" role="alert"><h1>无法读取文档</h1><p>{{ state.error }}</p><a href="#/">返回首页</a></section>
  <template v-else-if="state.page">
    <article class="markdown-content" @click="copy" v-html="state.page.html" />
    <p class="copy-feedback" role="status">{{ clipboard.message.value }}</p>
    <nav class="page-pagination" aria-label="相邻文档"><a v-if="previous" :href="'#' + previous.route"><small>上一页</small>{{ previous.title }}</a><a v-if="next" :href="'#' + next.route"><small>下一页</small>{{ next.title }}</a></nav>
  </template>
</template>
