import { startRecordsBrowser } from './application.ts';
import './style.css';

await startRecordsBrowser({ target: document.getElementById('app')!, baseUrl: location.origin,
  onError: () => console.error('记录样例呈现失败') });
