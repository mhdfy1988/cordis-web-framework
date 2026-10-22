import { randomBytes } from 'node:crypto';
import { ApiError } from 'cordis-web-framework/http-json';
import type { IdentityProvider, Principal } from './contracts.ts';

/** 只用于显式本地验收：选择身份不是正式认证，不能开放到公网。 */
export function createFixtureIdentity(): IdentityProvider {
  const sessions = new Map<string, Principal>();
  return {
    issue(mode) {
      if (sessions.size >= 16) throw new ApiError('unavailable');
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, Object.freeze({ subject: 'demo-user', canWrite: mode === 'editor' }));
      return { token, mode };
    },
    authenticate(credential) {
      const principal = credential ? sessions.get(credential) : undefined;
      if (!principal) throw new ApiError('unauthenticated');
      return principal;
    },
    close() { sessions.clear(); },
  };
}
