import { Context, Service } from 'cordis';
import assert from 'node:assert/strict';

// 仅为上游运行时试验夹具，不是 FluidBlock 公共接口或领域服务。
export function createRuntimeFixture(t, { expectedErrors = 0 } = {}) {
  const root = new Context();
  const events = [];
  const resources = new Set();
  const errors = [];
  const releases = [];
  let generation = 0;

  // 捕获真实日志调用用于断言，预期错误不能变成无声成功。
  t.mock.method(root.logger, 'error', (...args) => errors.push(args));
  t.after(async () => {
    releases.forEach(release => release());
    await root.fiber.dispose();
    assert.equal(resources.size, 0, '试验结束仍有登记资源未释放');
    assert.equal(errors.length, expectedErrors, '出现未预期的运行时错误日志，或预期故障没有留下证据');
  });

  function gate() {
    const deferred = Promise.withResolvers();
    releases.push(deferred.resolve);
    return deferred;
  }

  class ProbeService extends Service {
    constructor(ctx) {
      super(ctx, 'probe');
    }

    *[Service.init]() {
      this.generation = ++generation;
      this.open = true;
      const token = `provider:${this.generation}`;
      resources.add(token);
      events.push(`${token}:ready`);
      yield () => {
        this.open = false;
        resources.delete(token);
        events.push(`${token}:closed`);
      };
    }

    read() {
      if (!this.open) throw new Error('已关闭的试验服务不可读取');
      return this.generation;
    }
  }

  return { root, events, resources, errors, gate, ProbeService };
}
