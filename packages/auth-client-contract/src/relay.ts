/** Starry ID relay protocol, per integration-guide.md §11.2 / §11.3. */
export type RelayProvider = 'google' | 'apple';
export const RELAY_WEB_RETURN = 'https://clock.starry.phd/auth/done' as const;
export const RELAY_NATIVE_RETURN = {
  apple: 'clock://auth/apple',
  google: 'clock://auth/google',
} as const;
export const STARRY_ID_ORIGIN = 'https://id.starry.phd' as const;
export const APP_ID = 'clock' as const;

export function relayReturn(provider: RelayProvider, platform: 'web'|'native'): string {
  return platform === 'web' ? RELAY_WEB_RETURN : RELAY_NATIVE_RETURN[provider];
}

/** nonceHash must be lowercase SHA256 hex, never the raw nonce. */
export function buildRelayUrl(provider: RelayProvider, nonceHash: string, state: string, platform:'web'|'native'): string {
  if (!/^[a-f0-9]{64}$/.test(nonceHash)) throw new Error('invalid_nonce_hash');
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(state)) throw new Error('invalid_state');
  const url = new URL(STARRY_ID_ORIGIN + '/auth/' + provider + '/start');
  url.searchParams.set('app_id', APP_ID);
  url.searchParams.set('nonce', nonceHash);
  url.searchParams.set('return', relayReturn(provider, platform));
  url.searchParams.set('state', state);
  return url.toString();
}

export type RelayResult =
  | { ok: true; idToken: string; authorizationCode?:string }
  | { ok:false; reason:string };

/** Strictly checks the registered callback, the anti-CSRF state and response. */
export function parseRelayCallback(returnedUrl:string, provider:RelayProvider, platform:'web'|'native', expectedState:string): RelayResult {
  const expected = new URL(relayReturn(provider,platform));
  const actual = new URL(returnedUrl);
  if (actual.protocol !== expected.protocol || actual.host !== expected.host || actual.pathname !== expected.pathname ||
      actual.username || actual.password) throw new Error('unregistered_callback');
  const rawParams = platform === 'web' ? actual.hash.replace(/^#/,'') : actual.search.replace(/^\?/,'');
  const params = new URLSearchParams(rawParams);
  if (params.getAll('state').length !== 1 || params.get('state') !== expectedState) throw new Error('invalid_state');
  const error = params.get('error');
  if (error) return {ok:false,reason:'login_cancelled_or_failed'};
  if (params.getAll('id_token').length !== 1) throw new Error('missing_id_token');
  const idToken=params.get('id_token') || '';
  if (!idToken || idToken.length > 8192) throw new Error('invalid_id_token');
  const code=params.get('code') || undefined;
  if (code && code.length > 1024) throw new Error('invalid_authorization_code');
  return {ok:true,idToken,authorizationCode:code};
}
