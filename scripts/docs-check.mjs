import { checkLinks } from '../docs-site/check-links.mjs';
import { runNode } from './run.mjs';
runNode(['scripts/reference.mjs', 'check']);
runNode(['--test', '--test-timeout=15000', 'tests/docs-site.test.mjs']);
console.log('文档源链接／锚点：', await checkLinks());
