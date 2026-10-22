/** 只处理已经验证的 JSON 数据；不把运行时或第三方实例冻结成共享状态。 */
export function freezeData<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const item of Object.values(value)) freezeData(item, seen);
    Object.freeze(value);
  }
  return value;
}
