import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageToolError, inspectPngHeader, resizedSize, outputName } from '../examples/png-resizer/domain.ts';
import { createImageSession } from '../examples/png-resizer/image-session.ts';
import { readRequest, readResponse } from '../examples/png-resizer/protocol.ts';
import type { RasterProcessor } from '../examples/png-resizer/domain.ts';

const blob = new Blob(['fixture'], { type: 'image/png' });
const size = { width: 16, height: 8 };
function fixture(overrides: Partial<RasterProcessor> = {}) {
  const revoked: string[] = []; let made = 0;
  const model = createImageSession({ inspect: async () => size, resize: async (_blob, width) => ({ width, height: width / 2, blob }), ...overrides },
    { create: () => `blob:fixture-${++made}`, revoke(url) { revoked.push(url); } });
  return { model, revoked };
}
test('PNG 规则：固定头部预检、尺寸／像素／文件预算及等比输出', async () => {
  const bytes = new Uint8Array(33); bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const data = new DataView(bytes.buffer); data.setUint32(16, 16); data.setUint32(20, 8);
  assert.deepEqual(await inspectPngHeader(new Blob([bytes])), size);
  assert.deepEqual(resizedSize(size, '8'), { width: 8, height: 4 });
  for (const value of ['', '0', '-1', '1.5', '1e2', '4097', '0001']) assert.throws(() => resizedSize(size, value), ImageToolError);
  assert.throws(() => resizedSize({ width: 1, height: 4096 }, '2'), /too-large/);
  data.setUint32(16, 4096); data.setUint32(20, 4096); await assert.rejects(inspectPngHeader(new Blob([bytes])), /too-large/);
  await assert.rejects(inspectPngHeader(new Blob(['wrong-format'])), /invalid-file/);
  await assert.rejects(inspectPngHeader(new Blob([new Uint8Array(8 * 1024 * 1024 + 1)])), /too-large/);
  assert.equal(outputName('../角色.png', { width: 8, height: 4 }), '.._角色-8x4.png');
});
test('图片会话：同一真值接纳导入和输出，换图／关闭释放源图和已确认结果', async () => {
  const { model, revoked } = fixture(); await model.importFile(blob, '角色.png');
  assert.equal(model.inspect().phase, 'ready'); model.setWidth('8'); assert.equal(model.canProcess(), true);
  await model.resize(); assert.equal(model.inspect().result?.name, '角色-8x4.png'); assert.equal(model.inspectResources().urls, 2);
  model.setWidth('invalid'); assert.equal(model.canProcess(), false); await model.resize();
  assert.equal(model.inspect().result?.width, 8); assert.equal(model.inspect().error, true);
  await model.importFile(blob, '新图.png'); assert.equal(model.inspect().result, undefined); assert.equal(model.inspect().source?.name, '新图.png');
  assert.deepEqual(revoked, ['blob:fixture-1', 'blob:fixture-2']);
  const closing = model.close(); assert.equal(closing, model.close()); await closing;
  assert.equal(model.inspectResources().urls, 0); assert.equal(model.inspectResources().tasks, 0); assert.equal(new Set(revoked).size, 3);
});
test('错误文件或处理失败保留已接纳原图和上次结果，不用原逻辑静默兜底', async () => {
  let fail = false; const { model } = fixture({ inspect: async () => { if (fail) throw new ImageToolError('invalid-file'); return size; },
    resize: async (_blob, width) => { if (fail) throw new Error('private-decoder'); return { width, height: width / 2, blob }; } });
  await model.importFile(blob, 'old.png'); model.setWidth('8'); await model.resize(); const before = model.inspect();
  fail = true; await model.importFile(blob, 'bad.png'); assert.equal(model.inspect().source, before.source); assert.equal(model.inspect().result, before.result);
  await model.resize(); assert.equal(model.inspect().result, before.result); assert.match(model.inspect().status, /处理失败/);
  assert.ok(!model.inspect().status.includes('private-decoder')); await model.close();
});
test('导入 A 迟到不能覆盖导入 B，不为被拒绝结果创建对象 URL', async () => {
  const old = Promise.withResolvers<typeof size>(); let calls = 0;
  const { model } = fixture({ inspect: async () => ++calls === 1 ? old.promise : size });
  const first = model.importFile(blob, 'a.png'); await model.importFile(blob, 'b.png'); old.resolve(size); await first;
  assert.equal(model.inspect().source?.name, 'b.png'); assert.equal(model.inspectResources().urls, 1); await model.close();
});
test('取消后的迟到缩放不能发布，仍保留旧结果与参数；导入新图也使旧任务失效', async () => {
  let wait: ReturnType<typeof Promise.withResolvers<{ width: number; height: number; blob: Blob }>> | undefined;
  const { model } = fixture({ resize: async (_blob, width) => wait ? wait.promise : { width, height: width / 2, blob } });
  await model.importFile(blob, 'a.png'); model.setWidth('8'); await model.resize(); const result = model.inspect().result;
  wait = Promise.withResolvers(); const first = model.resize(); model.cancel(); wait.resolve({ width: 8, height: 4, blob }); await first;
  assert.equal(model.inspect().result, result); assert.equal(model.inspect().widthInput, '8'); assert.match(model.inspect().status, /已取消/);
  wait = Promise.withResolvers(); const second = model.resize(); await model.importFile(blob, 'b.png'); wait.resolve({ width: 8, height: 4, blob }); await second;
  assert.equal(model.inspect().source?.name, 'b.png'); assert.equal(model.inspect().result, undefined); assert.equal(model.inspectResources().urls, 1); await model.close();
});
test('外部取消即便底层忽略取消并正常返回，也不能接纳其输出', async () => {
  const wait = Promise.withResolvers<{ width: number; height: number; blob: Blob }>(); const { model } = fixture({ resize: () => wait.promise });
  await model.importFile(blob, 'a.png'); model.setWidth('8'); const controller = new AbortController(); const task = model.resize(controller.signal);
  controller.abort(); wait.resolve({ width: 8, height: 4, blob }); await task;
  assert.equal(model.inspect().result, undefined); assert.equal(model.inspect().error, false); assert.match(model.inspect().status, /已取消/); await model.close();
});
test('关闭先登记终态和取消，等待真实在途结果收尾；关闭后不可复活', async () => {
  const wait = Promise.withResolvers<typeof size>(); let aborted = false;
  const { model } = fixture({ inspect: async (_blob, signal) => { signal.addEventListener('abort', () => { aborted = true; void model.close(); }); return wait.promise; } });
  const task = model.importFile(blob, 'late.png'); const closing = model.close(); let completed = false; void closing.then(() => { completed = true; });
  await Promise.resolve(); assert.equal(completed, false); assert.equal(aborted, true); assert.equal(model.inspect().phase, 'closed');
  wait.resolve(size); await task; await closing; assert.equal(model.inspect().source, undefined); assert.equal(model.inspectResources().urls, 0);
  assert.throws(() => model.importFile(blob, 'late.png'), /关闭/); assert.throws(() => model.subscribe(() => {}), /关闭/);
});
test('工作线程协议：标识、版本、未知字段、对象类型和尺寸均校验，拒绝伪结果', () => {
  const request = readRequest({ protocol: 1, id: 1, kind: 'resize', width: 8, file: blob });
  assert.deepEqual(readResponse({ protocol: 1, id: 1, ok: true, width: 8, height: 4, blob }, request), { width: 8, height: 4, blob });
  for (const output of [{ protocol: 2, id: 1, ok: true, width: 8, height: 4, blob }, { protocol: 1, id: 2, ok: true, width: 8, height: 4, blob },
    { protocol: 1, id: 1, ok: true, width: 8, height: 4, blob: 'url' }, { protocol: 1, id: 1, ok: true, width: 7, height: 4, blob },
    { protocol: 1, id: 1, ok: true, width: 8, height: 4, blob, extra: true }]) assert.throws(() => readResponse(output, request), ImageToolError);
  assert.throws(() => readRequest({ protocol: 1, id: 1, kind: 'inspect', file: 'url' }), /invalid-file/);
  assert.throws(() => readResponse({ protocol: 1, id: 1, ok: false, code: 'invalid-file' }, request), /invalid-file/);
});
