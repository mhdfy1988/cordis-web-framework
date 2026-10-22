# 内置第三方代码与修复说明

`dist/runtime-cordis/index.js` 内置 Cordis 4.0.0-rc.11 与其运行依赖 cosmokit；具体解析版本以 package-lock.json 与构建元数据为准。Cordis 应用上游 PR #133 的终态刷新修复，补丁随包附带，详见 patches/README.md。

Cordis: https://github.com/cordiverse/cordis

cosmokit: https://github.com/shigma/cosmokit

二者适用以下 MIT 许可，原文来源分别为上述仓库的 LICENSE：

```text
MIT License

Copyright (c) 2021-present Shigma

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Zod（MIT）、semver（ISC）及 consola（MIT）作为正常运行依赖安装，各自许可随原包提供。本框架自有代码的对外许可证未确定，包保持 private／UNLICENSED；此文件不代替自有代码的授权决定。

Fastify（MIT）作为 Node 宿主运行依赖安装。Vue 3.5.44（MIT）与 Vue Router 4.6.4（MIT）是呈现适配的可选 peer，非界面消费者不强制安装；框架发布构建不内置它们，使用界面的应用显式安装并在应用构建时打包，各自许可随原包提供。界面组合只参考 DeepSeek Harness 固定源码的协议行为，没有复制其 React 代码；来源索引见 docs/w4-ui.md。
