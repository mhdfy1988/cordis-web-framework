import process from 'node:process';
import { startNodeHost, bindProcessSignals } from '../dist/hosts/node/index.js';
import { createCordisRuntime } from '../dist/runtime-cordis/index.js';

const host = await startNodeHost({ document: { formatVersion: 1, plugins: [], bindings: {} },
  catalog: new Map(), createRuntime: createCordisRuntime });
bindProcessSignals(host, snapshot => console.log(snapshot.state));
// Windows 无法用 child.kill('SIGTERM') 验证 JS 处理器；在独立进程派发同名进程事件。
process.emit('SIGTERM');
