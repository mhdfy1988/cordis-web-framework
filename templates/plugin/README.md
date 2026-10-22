# 独立插件模板

从本地交付 kit 的 templates/plugin 使用，framework.tgz 保持在 kit 根目录。不要从 npm 猜装同名框架。

```powershell
npm.cmd install --ignore-scripts --no-audit --no-fund
npm.cmd run build
```

编辑 plugin.json 的清单及平台入口，在 src/index.ts 实现自己的工厂和服务。生成 plugin.cwplugin.json 后，将整个 JSON 包交给存活宿主的框架管理接口；安装时明确确认 integrity，配置示例为 `{ "message": "你好" }`，随后单独启用。宿主不需要导入你的源码或重新构建。

普通依赖须随包构建，类型导入会被擦除；不能捆绑第二套 Vue／Cordis 或留下未解决导入。共享 UI／接口服务由宿主通过框架服务契约提供。文本资源在 assets 声明，工厂第二个参数可接收资源数组；资源应用和释放仍由作用域登记。完整操作、故障与信任边界见 kit/docs/guide/plugin-management.md。

本模板不代表插件市场、自动升级、任意 npm 安装或不可信代码沙箱。
