<script setup lang="ts">
import { computed } from 'vue';
import { documentsKey } from '../services/contracts.ts';
import { required } from './context.ts';
const documents = required(documentsKey); const page = computed(() => documents.session.state.value.page);
</script>
<template><nav v-if="page" class="outline-links"><a v-for="heading in page.headings.filter(item => item.level === 2 || item.level === 3)" :key="heading.id" :href="'#' + page.route + '?section=' + encodeURIComponent(heading.id)" :class="{ subheading: heading.level === 3 }">{{ heading.text }}</a></nav></template>
