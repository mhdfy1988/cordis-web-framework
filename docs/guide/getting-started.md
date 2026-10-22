# 快速开始

## 1. 准备环境和框架文件

当前验证组合为 Node **24.14.0**、npm **11.9.0**、Chrome **155**；包要求 Node `>=24.14.0 <25`。浏览器示例以 Chrome 为验收环境，其他环境需自行测试。Windows 命令使用 `.cmd`，以下终端示例均为 PowerShell。

你需要以下两种输入之一：

- 经许可取得的本地交付目录 `kit`，包含 `framework.tgz` 和 `templates`：直接转第 2 步。
- 本项目完整源码目录：在源码根目录运行以下命令。当前没有公开下载地址，不用猜 GitHub 仓库名或运行 `npm install cordis-web-framework`。

```powershell
node --version
npm.cmd --version
npm.cmd ci --no-audit --no-fund
npm.cmd run test:delivery
npm.cmd run verify:delivery
$report = Get-Content -Encoding utf8 ./output/delivery-result.json -Raw | ConvertFrom-Json
$kitPath = Join-Path (Get-Location) ("output/" + $report.kit)
$kitPath
```

成功判断：最后显示“交付候选与当前输入／产物一致”，`$kitPath` 指向实际存在的 kit。`test:delivery` 会构建、联网安装消费依赖并用独立 Chrome 执行验收，需要本机 Chrome；它不是启动产品的快捷命令。没有 Chrome 或网络时报告失败，不使用旧候选冒充新通过。

## 2. 将交付目录整体复制到新位置

从源码生成时，上一步的 `$kitPath` 已可用；收到 kit 时先将变量设为其绝对路径。选择不存在的新目标目录，保留 `framework.tgz` 与模板的相对位置。例如：

```powershell
$destination = Join-Path $env:TEMP ("my-cordis-app-" + [guid]::NewGuid().ToString('N'))
Copy-Item -LiteralPath $kitPath -Destination $destination -Recurse
Set-Location (Join-Path $destination 'templates/node')
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd start
```

安装会联网获取依赖，框架本身来自本地 `../../framework.tgz`。消费方不安装原始 Cordis、不执行补丁或 postinstall；首次就使用附带的锁。不要单独拿走模板并破坏包路径。收到 kit 的内容身份应由提供者核对，本地源码的 `verify:delivery` 不会对任意下载目录自动签名认证。

## 3. 确认运行并退出

终端输出 `服务端模板：http://127.0.0.1:<随机端口>`。在另一个终端将实际地址填入：

```powershell
Invoke-RestMethod 'http://127.0.0.1:<实际端口>/health/ready'
```

得到 `ready: true` 表示当前必需插件就绪。端口不是固定值；不要照抄尖括号。使用 Ctrl+C 发起受控停止，检查终端的关闭状态为 `stopped`。Windows 原生终端行为仍应按实际环境确认；程序接口可直接 `await host.stop()`，不能用 `process.exit()` 掩盖未释放资源。

## 4. 选择适合的模板

| 模板 | 在对应目录执行 | 下一步 |
| --- | --- | --- |
| node | `npm.cmd ci --ignore-scripts`、`npm.cmd start` | [写自己的插件](plugins.md) |
| browser | `npm.cmd ci --ignore-scripts`、`npm.cmd run build` | 将 `web` 用 HTTP(S) 静态服务器托管，不双击 HTML；[本地预览](templates.md) |
| fullstack | `npm.cmd ci --ignore-scripts`、`npm.cmd run build`、`npm.cmd start` | 用 Chrome 访问输出地址，选“编辑者”保存，再重新读取；身份只是演示 |

browser 示例需要 Worker、createImageBitmap、OffscreenCanvas 等能力，上传 PNG 后才可缩放下载。fullstack 的数据库在模板目录 `data/records.sqlite`，不能直接带演示身份上公网。

## 接下来

先读[核心概念](concepts.md)，再完成[插件教程](plugins.md)和[界面扩展](ui.md)。安装或启动错误见[排错](troubleshooting.md)。当前所有模板都是起点，不是生产认证、完整后台或即插即用的第三方插件市场。
