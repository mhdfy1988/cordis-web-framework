import { resolve } from 'node:path';
import { startRecordsApplication } from './server/application.ts';
import { readRecordAssets } from './server/assets.ts';
import { createLogger } from 'cordis-web-framework/logging';
import { bindProcessSignals } from 'cordis-web-framework/hosts/node';

const logger = createLogger({ context: { application: 'records-demo' } });
const host = await startRecordsApplication({ localDemo: true, databaseFile: resolve('output/records-demo/records.sqlite'),
  assets: readRecordAssets(resolve('output/records-web')), logger });
logger.log('info', '本地验收样例已启动，非正式登录', { address: host.address });
const unbind = bindProcessSignals(host, report => logger.log('info', '样例退出', { state: report.state }));
process.once('beforeExit', unbind);
