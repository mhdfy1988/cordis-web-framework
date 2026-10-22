import { resolve } from 'node:path';
import { startRecordsApplication } from '../records/server/application.ts';
import { readRecordAssets } from '../records/server/assets.ts';
import { createLogger } from 'cordis-web-framework/logging';
import { bindProcessSignals } from 'cordis-web-framework/hosts/node';

const logger = createLogger({ context: { application: 'ui-workspace-demo' } });
const host = await startRecordsApplication({ localDemo: true, databaseFile: resolve('output/ui-demo/records.sqlite'),
  assets: readRecordAssets(resolve('output/ui-workspace')), logger });
logger.log('info', '界面插件本地样例已启动，非正式登录', { address: host.address });
const unbind = bindProcessSignals(host, report => logger.log('info', '样例退出', { state: report.state }));
process.once('beforeExit', unbind);
