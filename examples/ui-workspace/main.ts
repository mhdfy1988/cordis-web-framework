import { startUiWorkspace } from './application.ts';
import './style.css';

const target = document.querySelector<HTMLElement>('#workspace')!;
const status = document.querySelector<HTMLElement>('#check-status')!;
const app = await startUiWorkspace({ target, baseUrl: location.origin, onError: () => { status.textContent = '扩展发生错误'; } });
export { app as workspace };
const controls = document.querySelector<HTMLFormElement>('#checks')!;
controls.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  for (const control of Array.from(controls.elements)) (control as HTMLInputElement).disabled = true;
  const action = input.name === 'layout' ? app.changeLayout(input.value as 'sidebar' | 'topbar')
    : input.name === 'help' ? app.toggleHelp(input.checked) : Promise.resolve(app.changeTheme(input.checked));
  void action.then(() => { status.textContent = '已应用'; }, () => { status.textContent = '切换失败，请检查插件状态'; })
    .finally(() => { if (app.host.inspect().state === 'ready') for (const control of Array.from(controls.elements)) (control as HTMLInputElement).disabled = false; });
});
document.querySelector('#stop')!.addEventListener('click', () => {
  void app.host.stop().then(report => {
    status.textContent = report.state === 'stopped' ? '已停止，界面与扩展已释放' : '清理未完成';
    for (const input of Array.from(controls.elements)) (input as HTMLInputElement).disabled = true;
  });
});
