import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script,runInNewContext} from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Web PWA uses official StarryClient SDK for Passkey and session rotation',async()=>{
 const [html,sdkSource,sdkBundle]=await Promise.all([
  read('web-preview/index.html'),read('apps/clock/src/auth/starry-client.ts'),
  read('web-preview/starry-client.js')
 ]);
 const script=html.split('<script>')[2]?.split('</script>')[0]??'';
 assert.doesNotThrow(()=>new Script(script),'Web inline script must still compile');
 assert.doesNotThrow(()=>new Script(sdkBundle),'Official SDK bundle must be executable');
 assert.match(html,/<script src="\/starry-client\.js"><\/script>/);
 assert.match(html,/new sdk\.StarryClient\(/);
 for(const id of ['loginPasskey','passkeyPanel','addPasskey','reloadPasskeys','passkeyList'])
  assert.ok(html.includes('id="'+id+'"'),'Missing Web Passkey UI: '+id);
 for(const method of ['signInWithPasskey','registerPasskey','listPasskeys','removePasskey'])
  assert.ok(html.includes('requireWebSdk().'+method),'Web missing SDK '+method);
 for(const endpoint of ['/v1/auth/passkey/options','/v1/auth/passkey',
  '/v1/me/passkeys/options','/v1/me/passkeys'])
  assert.ok(sdkSource.includes(endpoint),'Upstream Passkey SDK missing '+endpoint);
 assert.match(sdkSource,/navigator\.credentials\.get\(/);
 assert.match(sdkSource,/navigator\.credentials\.create\(/);
 assert.match(sdkSource,/base64urlDecode\(String\(publicKey\.challenge\)\)/);
 assert.doesNotMatch(html,/async function refreshWeb\(/,'No competing Web refresh-token rotation');
 assert.match(html,/for\(const id of \['loginGoogle','loginApple'\]\)/,'Google/Apple must remain');
 assert.doesNotMatch(html,/STARRY_BATTERY_KEY|x-starry-app-key|sbk_[A-Za-z0-9_-]{30,}/);
});
test('official Web SDK bundle exports StarryClient and WebAuthn adapter without network requests',async()=>{
 const code=await read('web-preview/starry-client.js');
 const sandbox={TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URLSearchParams};
 sandbox.globalThis=sandbox;
 runInNewContext(code,sandbox,{timeout:1000});
 assert.equal(typeof sandbox.StarrySDK?.StarryClient,'function');
 assert.equal(typeof sandbox.StarrySDK?.webPasskeyAdapter,'function');
 assert.equal(typeof sandbox.StarrySDK?.sessionStorageAdapter,'function');
});
test('Expo Passkey uses official StarryClient, a lazy native module and a safe RP ID',async()=>{
 const [session,native,account,appJson,pkg,lock,sdk]=await Promise.all([
  read('apps/clock/src/auth/session.ts'),read('apps/clock/src/auth/nativePasskeyAdapter.ts'),
  read('apps/clock/src/auth/StarryAccountPanel.tsx'),read('apps/clock/app.json'),
  read('apps/clock/package.json'),read('pnpm-lock.yaml'),read('apps/clock/src/auth/starry-client.ts')
 ]);
 assert.match(session,/passkey:Platform\.OS==='web'\?undefined:nativePasskeyAdapter/);
 assert.match(native,/require\('react-native-passkeys'\)/,'do not eagerly crash Expo Go without native module');
 assert.match(native,/id\.starry\.phd/);
 assert.match(native,/PASSKEY_RP_MISMATCH/);
 assert.match(native,/PASSKEY_CANCELLED/);
 for(const word of ['loginPasskey','createPasskey','removePasskey','listPasskeys'])
  assert.ok(account.includes(word),'Expo missing '+word);
 assert.match(account,/透過 Google 登入/);
 assert.match(account,/透過 Apple 登入/);
 assert.equal(JSON.parse(pkg).dependencies['react-native-passkeys'],'0.4.2');
 assert.match(lock,/react-native-passkeys@0\.4\.2/);
 assert.ok(JSON.parse(appJson).expo.ios.associatedDomains.includes('webcredentials:id.starry.phd'));
 for(const method of ['signInWithPasskey','registerPasskey','listPasskeys','removePasskey'])
  assert.ok(sdk.includes(method+'('),'official SDK missing '+method);
 assert.doesNotMatch(native,/STARRY_BATTERY_KEY|sbk_[A-Za-z0-9_-]{30,}/);
});

test('2026-11-07.12: native iOS shared Keychain SSO is opt-in and Android cannot use app-local storage',async()=>{
 const [session,app,screen,worker]=await Promise.all([
  read('apps/clock/src/auth/session.ts'),read('apps/clock/app.json'),
  read('apps/clock/app/index.tsx'),read('services/clock-api/src/routes.mjs')
 ]);
 const groups=JSON.parse(app).expo.ios.entitlements['keychain-access-groups'];
 assert.deepEqual(groups,['$(AppIdentifierPrefix)phd.starry.shared'],'v14 requires exactly the shared iOS group');
 assert.ok(groups[0].includes('$(AppIdentifierPrefix)'),'do not hardcode Apple Team ID');
 assert.match(session,/sharedStorage:Platform\.OS==='ios'\?iosSharedStorage:undefined/);
 assert.match(session,/starry\.syncDeviceSignIn\(\)/);
 assert.match(session,/IOS_SSO_MARKER/,'prevent resurrection after another App logged out');
 assert.match(screen,/syncStarryDeviceSignIn\(\)/);
 assert.match(screen,/onStarryAuthChange/);
 assert.match(worker,/from '\.\/starry-sdk\.ts'/);
 assert.doesNotMatch(session,/BATTERY_SERVICE_KEYS|STARRY_BATTERY_KEY/);
});

test('2026-11-07.14: Web login and logout use official browser-wide Starry SSO',async()=>{
 const [html,client,guide]=await Promise.all([
  read('web-preview/index.html'),
  read('apps/clock/src/auth/starry-client.ts'),
  read('docs/STARRY-ID-2026-11-07.14-AUDIT.md')
 ]);
 for(const method of ['shareWebSignIn','syncWebSignIn','completeWebSsoCheck','signOutWebEverywhere']){
  assert.ok(client.includes(method+'('),'official SDK lacks '+method);
  assert.ok(html.includes('.'+method+'('),'Clock Web does not invoke '+method);
 }
 assert.match(html,/WEB_SSO_RETURN='https:\/\/clock\.starry\.phd\/'/,'SSO return URL must be registered and fragment-free');
 assert.match(html,/const ssoReturn=await client\.completeWebSsoCheck\(\)/);
 assert.match(html,/if\(ssoReturn!==null\)/,'SSO callback must be handled before OAuth relay');
 assert.match(html,/if\(location\.pathname==='\/auth\/done'\)/);
 assert.match(html,/await client\.syncWebSignIn\(\{returnUrl:WEB_SSO_RETURN\}\)/);
 assert.match(html,/await requireWebSdk\(\)\.shareWebSignIn\(\{returnUrl:WEB_SSO_RETURN\}\)/);
 assert.match(html,/await requireWebSdk\(\)\.signOutWebEverywhere\(\{returnUrl:WEB_SSO_RETURN\}\)/);
 assert.doesNotMatch(html,/localStorage\.setItem\(['"]starry\.sso/);
 assert.match(guide,/Android.*選做/,'Android shared SSO is optional in v14');
});
