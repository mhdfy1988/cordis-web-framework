# Cordis 固定修复的构建交付

来源为 FluidBlock 已验证的 `cordis@4.0.0-rc.11` 与上游 [PR #133](https://github.com/cordiverse/cordis/pull/133)。补丁在等待／失败实例销毁收尾后刷新终态，避免 dispose 已结束而状态仍非 disposed。

本项目构建前使用 patch-package 应用补丁，并验证精确清单／安装版本和实际补丁内容。升级须先评审、更新或删除补丁及对应守卫，不能静默放行。

esbuild 将修复后的 Cordis 与运行依赖内置到 `dist/runtime-cordis/index.js`；公共类型不泄漏 Cordis 私有对象。消费方不安装 Cordis，不执行 postinstall，不要求修改 node_modules。安装禁用脚本仍可消费已构建的 tar 包。

代价：框架需要重建和独立回归才能升级内置运行时，产物包含第三方代码及许可；尚未支持 Cordis 可选动态插件加载器或任意生态插件的直接兼容。构建元数据写入 output，不属于公共包 API。
