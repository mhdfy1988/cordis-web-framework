export interface ConfigurationSource {
  readonly id: string;
  readonly kind: 'defaults' | 'file' | 'environment' | 'override';
  readonly values: Readonly<Record<string, unknown>>;
}
export interface ConfigurationSnapshot<T> {
  readonly value: Readonly<T>;
  /** 顶层字段的最终来源；不复制原始配置和秘密内容。 */
  readonly origins: Readonly<Record<string, string>>;
  readonly sources: readonly { readonly id: string; readonly kind: ConfigurationSource['kind'] }[];
}
