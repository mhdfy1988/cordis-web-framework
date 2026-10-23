# 运行中管理独立插件

插件管理是框架能力；页面、命令行和程序只调用同一管理接口。不安装管理页面也能使用本教程。

## 1. 准备独立插件

取得经许可的当前交付 kit，在 templates/plugin 执行 npm.cmd ci --ignore-scripts --no-audit --no-fund，再执行 npm.cmd run build。编辑 plugin.json 和 src/index.ts 后重新构建，输出 plugin.cwplugin.json。宿主不需要导入该源码或重新打包；这是插件自己的构建。

包规范与生产者限制见[独立包契约](../plugin-package.md)。默认导出工厂接收冻结的 manifest 和 assets 数组，返回 RegisteredPlugin。普通依赖随包构建，Vue／Cordis 不应重复捆绑；UI 插件声明消费宿主提供的呈现服务。文本资源由作用域明确登记和撤销，不因包安装自动生效。

## 2. 无页面运行管理器

以下为 Node 24 ESM 示例，在已安装当前框架的独立应用目录执行；安装库使用本应用 data，不使用框架源码目录。

```js
import { readFile } from 'node:fs/promises';
import { startPluginManager } from 'cordis-web-framework/management';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createNodePluginStore, createNodePluginLoader } from 'cordis-web-framework/hosts/node/plugins';

const manager = await startPluginManager({
  runtime: createCordisRuntime(),
  environment: { platform: 'node', capabilities: [] },
  store: createNodePluginStore('./data/plugins.json'),
  loader: createNodePluginLoader(),
});
try {
  // 宿主已运行，才接收独立包。先核对包来源及下面显示的精确摘要。
  const artifact = JSON.parse(await readFile('./plugin.cwplugin.json', 'utf8'));
  console.log('待接受摘要：', artifact.integrity);
  // 示例假定操作者已确认此本地包可信；不要给任意远程输入自动接受摘要。
  await manager.install(artifact, { acceptedIntegrity: artifact.integrity, config: { message: '你好' } });
  await manager.enable(artifact.manifest.id);
  console.log(manager.inspect()); // 检查真实 state，不用 Promise 结束替代 ready。
  await manager.disable(artifact.manifest.id);
  // 此处关闭后重开仍已安装且停用；若需要删除，调用 uninstall。
  await manager.uninstall(artifact.manifest.id);
} finally { await manager.close(); }
```

同一安装库不接受重复身份；第二次运行上例前应已成功卸载，或先 inspect 判断已有安装项再调用 enable。不要遇到已安装就吞错自动升级。acceptedIntegrity 是操作者的精确内容确认，SHA-256 不是作者签名或权限沙箱。

浏览器改用 hosts/browser/plugins 的 createBrowserPluginStore(name)、createBrowserPluginLoader()，environment 为 browser；需要安全来源、IndexedDB、Web Locks 和允许 Blob 模块的 CSP。浏览器安装包由文件选择或受信任获取入口提供，框架接收完整 JSON 数据；不执行 npm 安装或后台进程。Pages 可以承载浏览器模式，但不具备 Node 服务端管理。

## 3. 接入宿主和界面

startNodeHost／startBrowserHost／startVueHost 可传 management：store、loader、builtins 及可选 initialize。此时静态 document 使用 `{ formatVersion: 1, plugins: [], bindings: {} }`，catalog 使用空 Map，不同时走两套装配。builtins 中每项提供已注册模块、配置、显式绑定、默认 enabled 与 required。内置插件不能卸载，required 项不能停用或运行中重启。

管理器在 host.management；呈现 props 收到的 HostRuntimeView.management 是同一个管理入口，不是另一套页面控制器。浏览器与 Node 各拥有独立运行时和安装库，跨端管理需另行设计受认证的通信接口；本版不自动公开远程管理 API。

Vue 动态组件使用 presentation-vue/catalog 的 createVueViewCatalog，把 views 传给 createVueUi；通过 catalog.register(scope,id,component) 登记，再注册已有 UI 贡献。清理按逆序先撤贡献再撤组件。样式／文本 Blob 通过 createBrowserPluginResources 登记；CSS 仍须使用自己的根作用域，不是安全隔离。

Node 宿主传 dynamicApi 和 dynamicAssets。http-json/registry 提供 createJsonEndpointRegistry、createStaticAssetRegistry，业务插件通过显式服务消费；注册返回的撤销函数须交给 scope.onDispose。动态端点限定 `/extensions/` 命名空间，撤销先拒绝新请求，再等待已进入的处理器；文本资源限定 `/plugin-assets/`。静态路由不能占用已启用的动态命名空间。JSON 请求仍遵守既有协议头、预算、错误映射及身份契约，不因动态注册绕过安全检查。

## 4. 状态、配置与恢复

- inspect 返回安装项、版本、清单、enabled 意愿、当前运行状态、最新操作及诊断；configuration(id) 返回只读配置与绑定，subscribe 只观察状态。
- enable 保留用户启用意愿；缺显式提供者时可 waiting，激活失败可 failed，不能显示为已就绪。
- disable 不卸载包。默认 configure 只修改干净停用项；configure 的 restart=true 明确保存新配置和启用意愿，再停止并重建该可选实例。它不是无损版本升级。
- uninstall 默认拒绝仍有安装项绑定的提供者；先处理消费者或显式修改绑定。清理失败不能报告卸载成功。应用数据不在插件安装库中，默认不删除。
- initialize 仅在全新库调用，返回全部内置项的旧配置映射；框架校验并一次提交。旧设置损坏时拒绝，不静默开启全部插件；初始化成功后不再读旧键。
- 管理图变更串行，记录采用修订号比较交换。启停意愿和 pending 先保存，再执行和保存结果；保存失败则停止新操作并报告，运行效果不会自动回滚。刷新必须在操作保存完成后判断结果，点击本身不等于持久提交。
- 遇到 pending 恢复时按持久意愿重建并报告中断，重新核对实际状态；不恢复旧运行实例。启用失败后可先 disable 再重试，不能自动回到旧实现。

## 5. 关闭与限制

close 拒绝新操作，排空已接纳操作、关闭运行时，再释放存储独占权；drain 只封闭新管理操作并等待队列，供宿主先排空 HTTP 再释放插件。宿主超时仍只是观察，不强杀未清理插件。

自 `0.1.0-rc.2` 起，配置校验失败但已加载的模块也随停用／卸载释放。启动失败与正常关闭共用收尾路径；运行实例干净停止后逐项释放模块，单项失败仍尝试其他模块。模块释放失败时不提前关闭其加载器／仓库，也不交出安装库独占权；不能重新启用该脏模块，须先完成停用释放。加载器和仓库关闭错误同样显式保留。启动与清理同时失败时，聚合错误保留原启动原因，不能当成可安全重开的成功关闭。

资源所有权也限定在本次获取：管理器只关闭本次成功获取的标准包仓库，失败的第二个管理器不能关闭第一个的仓库。安装库每次 acquire 返回独立的幂等释放句柄，旧句柄在重新获取后也不能解锁新一轮；这不改变存储独占、修订比较交换或持久恢复的规则。

同源同名浏览器安装库只允许一个存活写入管理器；其他页面应使用不同实例名／独立用户上下文，或等待原管理器关闭。本版没有跨标签页管理同步。Node 同一路径用独占锁，异常进程退出的遗留 .lock 需操作者确认原进程已退出后处理，禁止超时自动抢锁。锁释放失败、数据库不可用、坏记录均显式报错。

单包 4 MiB、安装库 32 MiB、128 安装项；单个加载会话最多 128 种代码版本，重复启停同内容不无限创建 Blob URL。干净停止实例可由运行时 forgetStopped 显式归档，诊断仍保留；模块引擎缓存无法保证立即回收。Node／浏览器同进程可信代码不是沙箱，不支持任意来源执行、强制终止、不可信插件权限隔离、自动升级或远程市场。

## npm 格式插件包

这里的标准包必须符合本框架接口，而非任意 npm 库。随 kit 的 `templates/npm-plugin` 提供可独立构建的完整样例，保留 Node 多文件及普通依赖，并生成可供浏览器导入的 `browser-plugin.json`；旧 `templates/plugin` 继续生成原 JSON／ESM 包。

Node 在同一个管理器选项内增加仓库：

```ts
import { createNodePackageRepository } from 'cordis-web-framework/hosts/node/plugins';
// packages 与 store 均使用应用显式指定的绝对路径，不能放进宿主 node_modules。
const packages = createNodePackageRepository({ directory: packageDirectory });
// startPluginManager({ ...原选项, packages }) 或 startNodeHost({ management: { ...原选项, packages } })
await manager.installPackage({ type: 'file', path: absoluteTarball }, { acceptTrustedCode: true });
await manager.enable('example.standard');
await manager.disable('example.standard');
await manager.uninstall('example.standard');
```

仓库支持本地绝对目录／tgz，或 `{ type: 'registry', name, version, registry? }`；仓库版本必须精确，registry 必须 HTTPS（回环测试允许 HTTP），不能含用户名／密码／查询参数。`npmCli` 可显式指定 npm JavaScript CLI 路径，默认从当前 Node 安装目录定位；`timeoutMs` 默认 120 秒，安装 `signal` 可取消，`onProgress` 输出 installing／validating／stored。超时和取消等待包管理进程结束再移除暂存目录；不暴露原始 npm 日志或凭据。

安装默认 `--ignore-scripts`，没有脚本批准入口，不支持要求安装时编译的包或 Git 安装来源。根框架 peer 按实际安装包版本核对；预发布范围须包含该预发布版本，例如 `^0.1.0-rc.1`。普通依赖交 npm 安装，其他 peer 应改为显式 shared 能力。包声明为 `package.json.cordisWeb`，格式见[包规范](../plugin-package.md)。一次包库最多一个管理器；同一包的版本更新需后续升级协议，不能重复身份覆盖。

包内容摘要覆盖受管安装树和 npm 锁文件；安装后入口被改写，启用／恢复拒绝。安装树限制 64 MiB／4096 文件，不允许可逃逸符号链接（不参与运行的 npm .bin 与内部 .package-lock.json 跳过），资源 64 项；浏览器交付总数据 8 MiB，安装文档仍受 32 MiB／128 项预算。npm 安装后才做树预算检查，不把它宣称为下载流量／磁盘沙箱。包库异常退出遗留 .lock 仍需确认原进程已退出后人工恢复。

全栈应用可从已安装的包调用 `packages.exportBrowser(packageArtifact)`，经受保护的应用传输层提供给客户端。该方法不擅自创建无认证安装端点；服务端安装事实和各浏览器客户端的激活状态必须分别显示。应用对外提供安装 API 时仍须实现身份和权限，不能直接公网暴露本地管理能力。

浏览器使用 `createBrowserPackageRepository({ shared: { vue } })` 接入同一管理器，导入导出的 JSON：

```ts
import { createBrowserPackageRepository } from 'cordis-web-framework/hosts/browser/plugins';
import { PluginPackagePanel } from 'cordis-web-framework/presentation-vue/management';
// const packages = createBrowserPackageRepository({ shared: { vue } });
// 在管理器／宿主的 management 选项中传入 packages。
await manager.installPackage(browserDelivery, { acceptTrustedCode: true });
// 可选视图：h(PluginPackagePanel, { manager })，不想要界面直接调用 manager。
```

工厂第二参数的 `assets` 是当前平台可用的资源 URL，浏览器停用后撤销对象 URL，插件自己先取消请求、卸载视图；`shared` 注入宿主单例，包必须声明所需名称。浏览器入口要求自包含 ESM，模板构建门禁拒绝外部导入及重复运行时；手工包违反要求会在激活时报错，可信不是免校验或可运行任意 Node 入口。现代浏览器须允许 Blob 模块及所用资源类型，内容安全策略由应用配置，不自动绕过。

安装 npm 包使用新的可选 `Installation.package` 字段，旧 JSON artifact 不变。新框架能读旧记录；含新字段的记录不可交旧版本读取，升级前备份，未承诺降级。存储写失败停止新操作，暂存孤立目录下次持锁恢复清理；卸载先提交记录移除再清理包文件，物理清理失败显式报错而非恢复已停用代码。默认保留应用用户数据。

维护验证增加 `npm.cmd run test:npm` 和 `npm.cmd run test:npm:browser`；后者在隔离 Chrome 验证服务端导出、Vue 单例、图片／CSS、启停／刷新／卸载，以及关闭后端后的纯静态嵌套路径。

## 验证入口

维护仓执行 npm.cmd test、npm.cmd run test:management:browser、npm.cmd run test:package；工程外链路从同一 tarball 独立构建插件、在存活宿主安装，并回读文件、DOM、刷新状态及资源释放。证据归属见[实施计划](../implementation-plan.md)，本地验收不等于正式发布或已部署。
