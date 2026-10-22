# npm 格式插件模板

随交付 kit 一起使用，在本目录执行：

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
npm.cmd run check
npm.cmd pack --ignore-scripts
```

Node 入口保留多个 JS 文件及 semver 依赖；browser-plugin.json 是标准包构建时导出的浏览器交付文件，可在管理面板导入。构建不发布包，框架 tgz 必须保留在 ../../framework.tgz。模板 private 默认保留，是否公开发布及许可证另定。

安装只处理代码和依赖，不执行插件入口；显式启用才运行。作用域清理必须覆盖插件创建的计时、监听、组件及请求。Vue 等共享实例经工厂第二参数 shared 提供，不把它们放进插件 dependencies。浏览器入口不能遗留外部 import，资源经 assets 参数使用。
