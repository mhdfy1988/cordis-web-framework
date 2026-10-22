/** 导航项只引用已登记路由；路由不等于菜单，隐藏路由不强制生成菜单。 */
export interface UiRoute { readonly id: string; readonly path: string; readonly view: string }
export interface UiNavigation { readonly id: string; readonly label: string; readonly routeId: string; readonly order?: number }
export interface UiTheme { readonly id: string; readonly tokens: Readonly<Record<string, string>> }
