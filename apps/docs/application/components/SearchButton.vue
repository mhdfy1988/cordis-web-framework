<script setup lang="ts">
import { required } from './context.ts';
import { commandsKey } from '../services/contracts.ts';
const commands = required(commandsKey);
</script>
<template><button class="search-trigger" @click="commands.execute('docs.search', {})">搜索文档 <kbd>Ctrl K</kbd></button></template>
