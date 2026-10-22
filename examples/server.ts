import { startNodeHost, bindProcessSignals } from 'cordis-web-framework/hosts/node';
import { createCordisRuntime } from 'cordis-web-framework/runtime-cordis';
import { createLogger } from 'cordis-web-framework/logging';

const logger = createLogger({ context: { host: 'node-example' } });
const host = await startNodeHost({ document: { formatVersion: 1, plugins: [], bindings: {} },
  catalog: new Map(), createRuntime: createCordisRuntime });
const unbind = bindProcessSignals(host, result => logger.log('info', '宿主已退出', { state: result.state }));
logger.log('info', 'HTTP 宿主已就绪', { address: host.address });
// 退出时撤销可能残留的监听；不提前调用 completion()，那会发起停止。
process.once('beforeExit', unbind);
