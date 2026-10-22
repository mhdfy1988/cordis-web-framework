export const pluginLabels: Readonly<Record<string, { name: string; description: string; locked?: string }>> = {
  'docs.foundation': { name: '应用基础', description: '界面注册表、命令与导航服务', locked: '基础服务' },
  'docs.content': { name: '文档内容', description: '文档清单与加载会话', locked: '文档会话' },
  'docs.clipboard': { name: '代码复制', description: '剪贴板与操作反馈', locked: '正文依赖' },
  'docs.content-view': { name: '正文出口', description: '文档页面与路由出口', locked: '阅读入口' },
  'docs.navigation': { name: '文档导航', description: '页面路由与章节导航', locked: '导航基础' },
  'docs.management': { name: '插件管理', description: '独立管理路由与恢复入口', locked: '保留恢复入口' },
  'ui.default-layout': { name: '默认布局', description: '页头、导航、正文与辅助区域' },
  'ui.default-theme': { name: '默认主题', description: '当前应用的深浅配色与偏好' },
  'docs.theme-control': { name: '主题操作', description: '文档页的主题切换按钮', locked: '随默认主题启停' },
  'docs.search': { name: '文档搜索', description: '全文检索、弹窗与快捷键' },
  'docs.header': { name: '搜索入口', description: '文档页头的搜索按钮', locked: '随文档搜索启停' },
  'docs.outline': { name: '页内目录', description: '当前页面的标题锚点' },
};
export const stateLabels: Readonly<Record<string, string>> = { 'not-loaded': '未启用', ready: '运行中', stopped: '已停用', starting: '启动中', stopping: '停止中', waiting: '等待依赖', failed: '启动失败', 'cleanup-failed': '清理失败' };
