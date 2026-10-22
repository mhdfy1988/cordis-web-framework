import { startDocumentation } from './start.ts';
import '@cordis-web/default-ui/style.css';
import './styles/shell.css';
import './styles/markdown.css';
const target = document.querySelector<HTMLElement>('#app')!;
const state = document.createElement('section'); state.id = 'application-state'; state.hidden = true; target.after(state);
try {
  await startDocumentation(target, import.meta.env.BASE_URL, value => { state.hidden = false;
    const title = document.createElement('h1'); title.textContent = '文档应用已停止'; const details = document.createElement('pre'); details.textContent = JSON.stringify(value, null, 2);
    const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = '重新打开文档站'; reload.addEventListener('click', () => location.reload()); state.replaceChildren(title, reload, details);
  });
} catch (error) { state.hidden = false; state.setAttribute('role', 'alert'); state.textContent = '文档应用启动失败：' + (error instanceof Error ? error.message : String(error)); }
