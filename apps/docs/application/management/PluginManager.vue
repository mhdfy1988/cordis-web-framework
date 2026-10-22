<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { required, stopKey } from '../components/context.ts';
import { pluginControllerKey } from './context.ts';
import { optionalGroups } from './controller.ts';
import { pluginLabels, stateLabels } from './metadata.ts';
import { PluginPackagePanel } from 'cordis-web-framework/presentation-vue/management';
const activeTab = ref<'application' | 'packages'>('application');
const controller = required(pluginControllerKey); const stop = required(stopKey);
const selected = ref('ui.default-layout');
const selectedModule = computed(() => controller.modules.find(module => module.id === selected.value)!);
const detail = computed(() => controller.current(selected.value));
const layoutReady = computed(() => controller.state('ui.default-layout') === 'ready');
const diagnostics = computed(() => [...(controller.snapshot.value?.plugins.flatMap(item => item.runtime?.diagnostics ?? []) ?? []),
  ...(controller.snapshot.value?.diagnostics.map(message => ({ pluginId: 'framework', message })) ?? [])]);
const orderedModules = computed(() => [...controller.modules].filter(module => controller.snapshot.value?.plugins.find(item => item.id === module.id)?.builtin !== false).sort((a, b) => Number(!optionalGroups[a.id]) - Number(!optionalGroups[b.id])));
const detailsElement = ref<HTMLElement>();
async function selectPlugin(id: string) { selected.value = id; if (matchMedia('(max-width:959px)').matches) { await nextTick(); detailsElement.value?.scrollIntoView({ block: 'start' }); detailsElement.value?.focus({ preventScroll: true }); } }
</script>
<template>
  <div class="plugin-manager">
    <header class="manager-header"><a v-if="layoutReady" href="#/">← 返回文档</a><span v-else>布局已停用</span><span>Cordis Web Framework</span><button @click="stop" :disabled="!!controller.busy.value">停止应用</button></header>
    <main class="manager-main">
      <div class="manager-title"><div><span class="eyebrow">应用控制</span><h1>插件管理</h1></div><span class="runtime-state">{{ controller.modules.filter(plugin => controller.state(plugin.id) === 'ready').length }} / {{ controller.modules.length }} 运行中</span></div>
      <p v-if="controller.error.value" class="management-error" role="alert">{{ controller.error.value }}</p>
      <section v-if="!layoutReady" class="layout-notice" role="status">文档布局已停用，管理页仍可使用。<button :disabled="!!controller.busy.value" @click="controller.changeLayout('sidebar')">恢复默认布局</button></section>
      <nav class="manager-tabs" aria-label="插件分类"><button :aria-pressed="activeTab === 'application'" @click="activeTab = 'application'">应用插件</button><button :aria-pressed="activeTab === 'packages'" @click="activeTab = 'packages'">独立插件包</button></nav>
      <PluginPackagePanel v-if="activeTab === 'packages' && controller.manager" :manager="controller.manager" />
      <div v-else class="manager-columns">
        <section class="plugin-list" aria-label="插件列表"><div class="list-heading"><h2>应用插件</h2><span>自动保存到本机</span></div>
          <article v-for="module in orderedModules" :key="module.id" class="plugin-row" :data-plugin="module.id" :class="{ selected: selected === module.id }">
            <button class="plugin-select" :aria-pressed="selected === module.id" @click="selectPlugin(module.id)"><strong>{{ pluginLabels[module.id]?.name ?? module.id }}</strong><small>{{ module.id }}</small></button>
            <span class="plugin-state" :data-state="controller.state(module.id)">{{ stateLabels[controller.state(module.id) ?? ''] ?? '未装载' }}</span>
            <button v-if="optionalGroups[module.id]" class="plugin-action" :disabled="!!controller.busy.value" :aria-label="(controller.enabled(module.id) ? '停用' : '启用') + pluginLabels[module.id]?.name" @click="controller.toggle(module.id)">{{ controller.busy.value === module.id ? '处理中…' : controller.enabled(module.id) ? '停用' : '启用' }}</button>
            <span v-else class="locked-label">{{ pluginLabels[module.id]?.locked }}</span>
          </article>
        </section>
        <aside ref="detailsElement" class="plugin-details" tabindex="-1" aria-label="插件详情">
          <div class="detail-heading"><span class="eyebrow">插件详情</span><h2>{{ pluginLabels[selected]?.name ?? selected }}</h2><p>{{ pluginLabels[selected]?.description }}</p></div>
          <dl><div><dt>标识</dt><dd>{{ selected }}</dd></div><div><dt>版本</dt><dd>{{ selectedModule.version }}</dd></div><div><dt>状态</dt><dd>{{ stateLabels[detail?.state ?? ''] ?? '未装载' }}</dd></div><div><dt>运行代次</dt><dd>{{ detail?.generation ?? '—' }}</dd></div></dl>
          <section v-if="selected === 'ui.default-layout'" class="layout-options"><h3>布局</h3><div role="group" aria-label="布局选择"><button v-for="item in (['sidebar', 'topbar'] as const)" :key="item" :aria-pressed="layoutReady && controller.variant.value === item" :disabled="!!controller.busy.value" @click="controller.changeLayout(item)">{{ item === 'sidebar' ? '侧栏布局' : '顶部布局' }}</button></div></section>
          <section><h3>依赖服务</h3><ul v-if="selectedModule.requires.length"><li v-for="item in selectedModule.requires" :key="item.id"><code>{{ item.id }}</code><small>{{ item.range }}</small></li></ul><p v-else class="empty-value">无</p></section>
          <section><h3>提供服务</h3><ul v-if="selectedModule.provides.length"><li v-for="item in selectedModule.provides" :key="item.id"><code>{{ item.id }}</code><small>{{ item.version }}</small></li></ul><p v-else class="empty-value">无</p></section>
          <section v-if="selected === 'ui.default-theme'"><p class="detail-note">停用时同步移除主题操作；重新启用会重新装载两项插件。</p></section>
          <section v-if="selected === 'docs.search'"><p class="detail-note">停用时一并释放搜索入口、索引请求和快捷键。</p></section>
          <section><h3>诊断 <span>{{ diagnostics.length }}</span></h3><p v-if="!diagnostics.length" class="empty-value">暂无异常</p><ul v-else class="diagnostics"><li v-for="(item, index) in diagnostics" :key="index">{{ item.pluginId }} · {{ item.message }}</li></ul></section>
        </aside>
      </div>
    </main>
  </div>
</template>
<style scoped src="./manager.css"></style>
<style scoped>
.manager-tabs{display:flex;gap:8px;margin-bottom:24px}.manager-tabs button[aria-pressed="true"]{border-color:var(--accent,#3454d1);color:var(--accent,#3454d1)}
</style>
