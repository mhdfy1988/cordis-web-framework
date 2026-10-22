import type { UiContribution, UiPosition } from '../contracts/ui.ts';
import { uiContributionValidator, uiPositionValidator } from '../validation-zod/index.ts';
import { isRange, isVersion } from '../version-semver/index.ts';

export function validatePosition(input: UiPosition): UiPosition {
  const parsed = uiPositionValidator.validate(input);
  if (!parsed.ok || !isVersion(parsed.value.version)) throw new TypeError('位置声明格式或版本无效');
  return Object.freeze(parsed.value);
}
export function validateContribution(input: UiContribution): UiContribution {
  const { select, ...data } = input;
  const parsed = uiContributionValidator.validate(data);
  if (!parsed.ok || !isRange(parsed.value.range) || select !== undefined && typeof select !== 'function') throw new TypeError('界面贡献格式或选择器无效');
  return Object.freeze({ ...parsed.value, children: Object.freeze((parsed.value.children ?? []).map(validatePosition)), ...(select ? { select } : {}) });
}
