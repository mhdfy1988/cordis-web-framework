import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { StaticAsset } from 'cordis-web-framework/contracts/http';

export function readRecordAssets(directory: string): StaticAsset[] {
  return [
    { path: '/', contentType: 'text/html; charset=utf-8', content: readFileSync(resolve(directory, 'index.html'), 'utf8') },
    { path: '/app.js', contentType: 'text/javascript; charset=utf-8', content: readFileSync(resolve(directory, 'app.js'), 'utf8') },
    { path: '/app.css', contentType: 'text/css; charset=utf-8', content: readFileSync(resolve(directory, 'app.css'), 'utf8') },
  ];
}
