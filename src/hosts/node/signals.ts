import process from 'node:process';
import type { HostHandle } from '../../contracts/host.ts';
import type { ShutdownSnapshot } from '../../contracts/shutdown.ts';

/** 显式启用，不调用 process.exit；超时后仍保留实际资源责任。 */
export function bindProcessSignals(host: HostHandle, report: (snapshot: ShutdownSnapshot) => void): () => void {
  let listening = true;
  const dispose = () => {
    if (!listening) return;
    listening = false;
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  };
  function stop() {
    dispose();
    void host.stop().then(snapshot => {
      if (snapshot.state !== 'stopped') process.exitCode = 1;
      report(snapshot);
    }).catch(() => { process.exitCode = 1; });
  }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return dispose;
}
