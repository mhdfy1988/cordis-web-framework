import { defineConfig } from 'vitepress';
import { resolve } from 'node:path';
import { basePath, siteRoot, sources, documentationPlugin } from '../model.mjs';
const base = basePath(process.env.DOCS_BASE_PATH);
const section = (text, items, collapsed) => ({ text, ...(collapsed === undefined ? {} : { collapsed }), items: items.map(([text, link]) => ({ text, link })) });
export default defineConfig({
  lang: 'zh-CN', title: 'Cordis Web Framework', description: '开发版框架使用手册', base,
  srcDir: '.generated', outDir: resolve(siteRoot, '../output/docs-site'), cacheDir: resolve(siteRoot, '.vitepress/cache'),
  cleanUrls: false, lastUpdated: false, ignoreDeadLinks: false,
  markdown: { codeCopyButtonTitle: '复制代码', config: documentationPlugin(sources(), base) },
  themeConfig: {
    siteTitle: '框架文档 · 开发版', outline: { level: [2, 3], label: '本页目录' },
    nav: [{ text: '入门', link: '/guide/getting-started' }, { text: 'API', link: '/reference/index' }, { text: '更新', link: '/changelog' }],
    sidebar: [
      section('开始使用', [['概览', '/'], ['能力与概念', '/guide/concepts'], ['快速开始', '/guide/getting-started']]),
      section('开发教程', [['编写插件', '/guide/plugins'], ['界面扩展', '/guide/ui'], ['通信与数据', '/guide/communication'], ['模板与示例', '/guide/templates']]),
      section('API 参考', [['公开入口', '/reference/index'], ['运行与装配', '/reference/core'], ['配置、日志与关闭', '/reference/foundation'], ['宿主与 HTTP', '/reference/hosts-http'], ['界面与命令', '/reference/ui'], ['完整类型签名', '/reference/signatures']], false),
      section('指南', [['排错', '/guide/troubleshooting'], ['工程交付与升级', '/guide/delivery'], ['文档站维护', '/guide/documentation'], ['更新日志', '/changelog']]),
      section('架构与研发记录', [['记录索引', '/records'], ['整体规划', '/web-framework-plan'], ['W1 公共核心', '/w1-core'], ['W2 宿主', '/w2-hosts'], ['W3 全栈', '/w3-fullstack'], ['W4 界面', '/w4-ui'], ['W5 跨应用', '/w5-browser-tool'], ['W6 交付', '/w6-delivery']], true),
    ],
    search: { provider: 'local', options: {
      locales: { root: { translations: {
        button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
        modal: { noResultsText: '没有结果', resetButtonTitle: '重置搜索', backButtonTitle: '关闭搜索', displayDetails: '显示详情',
          footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } },
      } } },
      miniSearch: { options: { tokenize: text => {
        // 使用平台分词，不手写中文切词算法；索引与浏览器查询使用同一个函数。
        const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
        return [...segmenter.segment(text)].filter(item => item.isWordLike).map(item => item.segment.toLowerCase());
      } } },
    } },
    docFooter: { prev: '上一页', next: '下一页' }, sidebarMenuLabel: '文档导航', returnToTopLabel: '返回顶部',
    darkModeSwitchLabel: '主题', lightModeSwitchTitle: '切换浅色主题', darkModeSwitchTitle: '切换深色主题',
  },
});
