import { startImageTool } from './application.ts';
import './style.css';
const target = document.querySelector<HTMLElement>('#app')!;
export const tool = await startImageTool({ target, onError() {
  const status = target.querySelector('[role=status]'); if (status) status.textContent = '界面扩展发生错误，请重新打开工具';
} });
export { startImageTool };
