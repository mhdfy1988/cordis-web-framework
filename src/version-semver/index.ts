import { valid, validRange, satisfies } from 'semver';

// 不使用 loose/coerce 或全局接纳预发布版；需要预发布版时必须显式写入范围。
export const isVersion = (value: string) => valid(value) === value;
export const isRange = (value: string) => value.trim().length > 0 && validRange(value) !== null;
export const matchesVersion = (version: string, range: string) => satisfies(version, range);
