import { startApplication } from './application.mjs';
import { bindProcessSignals } from 'cordis-web-framework/hosts/node';
const host = await startApplication();
console.log(`服务端模板：${host.address}`);
const unbind = bindProcessSignals(host, result => console.log('关闭状态：', result.state));
process.once('beforeExit', unbind);
