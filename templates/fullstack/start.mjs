import { startApplication } from './application.mjs';
import { bindProcessSignals } from 'cordis-web-framework/hosts/node';
const host = await startApplication();
console.log(`仅限本机的全栈模板：${host.address}，身份为演示夹具`);
const unbind = bindProcessSignals(host, result => console.log('关闭状态：', result.state));
process.once('beforeExit', unbind);
