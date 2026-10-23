import { startDocumentation } from './start.ts';
import { createPageRunState } from './services/page-run-state.ts';
import '@cordis-web/default-ui/style.css';
import './styles/shell.css';
import './styles/markdown.css';
const target = document.querySelector<HTMLElement>('#app')!;
const state = document.createElement('section'); state.id = 'application-state'; state.hidden = true; target.after(state);
function showStopped(resume: () => void, value?: unknown) {
  target.hidden = true;
  state.hidden = false;
  const title = document.createElement('h1'); title.textContent = '文档应用已停止';
  const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = '重新打开文档站';
  reload.addEventListener('click', () => {
    try { resume(); location.reload(); }
    catch { const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = '无法清除暂停状态，请检查浏览器会话存储'; state.append(error); }
  });
  state.replaceChildren(title, reload);
  if (value !== undefined) { const details = document.createElement('pre'); details.textContent = JSON.stringify(value, null, 2); state.append(details); }
}
try {
  const runState = createPageRunState(sessionStorage, import.meta.env.BASE_URL);
  if (runState.paused()) showStopped(runState.resume);
  else await startDocumentation(target, import.meta.env.BASE_URL, value => showStopped(runState.resume, value), runState.pause);
} catch (error) { state.hidden = false; state.setAttribute('role', 'alert'); state.textContent = '文档应用启动失败：' + (error instanceof Error ? error.message : String(error)); }
