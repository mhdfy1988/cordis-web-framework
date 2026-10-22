<script setup lang="ts">
import { required } from './context.ts';
import { commandsKey, preferencesKey } from '../services/contracts.ts';
const commands = required(commandsKey); const preferences = required(preferencesKey);
</script>
<template><button :aria-pressed="preferences.dark.value" aria-label="切换深浅色主题" @click="commands.execute('docs.theme', {})">{{ preferences.dark.value ? '浅色' : '深色' }}</button></template>
