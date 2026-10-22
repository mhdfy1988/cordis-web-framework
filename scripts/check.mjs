import { createRequire } from 'node:module';
import { runNode } from './run.mjs';

const require = createRequire(import.meta.url);
runNode(['scripts/build.mjs']);
runNode([require.resolve('typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.test.json']);
runNode(['--test', '--test-timeout=15000', 'experiments/cordis-runtime/runtime.test.mjs',
  'tests/runtime/contract.test.ts', 'tests/composition/composition.test.ts',
  'tests/config.test.ts', 'tests/logging.test.ts', 'tests/shutdown.test.ts', 'tests/boundaries.test.ts',
  'tests/hosts.test.ts', 'tests/http-json.test.ts', 'tests/records.test.ts', 'tests/editor-session.test.ts', 'tests/ui.test.ts', 'tests/png-resizer.test.ts', 'tests/png-boundaries.test.ts', 'tests/png-build.test.mjs', 'tests/delivery.test.mjs', 'tests/reference.test.mjs']);
runNode(['--test', '--test-timeout=15000', 'tests/management-contract.test.ts', 'tests/management-store.test.ts', 'tests/management.test.ts', 'tests/management-host.test.ts', 'tests/management-failures.test.ts']);
runNode(['--test', '--test-timeout=60000', 'tests/npm-package.test.ts', 'tests/npm-management.test.ts', 'tests/npm-registry.test.ts']);
