<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue';
import type { Component } from 'vue';
import { required } from '../components/context.ts';
import { documentsKey, navigationKey } from '../services/contracts.ts';
import { pluginControllerKey } from './context.ts';
import PluginManager from './PluginManager.vue';
defineProps<{ root: Component }>();
const navigation = required(navigationKey); const revision = ref(0);
const controller = required(pluginControllerKey); const documents = required(documentsKey);
onUnmounted(navigation.subscribe(() => { revision.value++; }));
const managing = computed(() => { revision.value; return navigation.current() === 'plugin-manager'; });
const recovery = computed(() => controller.state('ui.default-layout') !== 'ready');
watch([managing, recovery, () => documents.session.state.value.page?.id], () => {
  if (managing.value || recovery.value) document.title = '插件管理 · Cordis Web Framework';
}, { immediate: true });
</script>
<template><PluginManager v-if="managing || recovery" /><component :is="root" v-else /></template>
