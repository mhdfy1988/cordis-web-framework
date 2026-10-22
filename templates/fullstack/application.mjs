import { resolve } from 'node:path';
import { startRecordsApplication } from './app/server/application.ts';
import { readRecordAssets } from './app/server/assets.ts';
export function startApplication() {
  return startRecordsApplication({ localDemo: true, databaseFile: resolve('data/records.sqlite'), assets: readRecordAssets(resolve('web')) });
}
