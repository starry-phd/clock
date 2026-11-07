import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=(p)=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [native,web,guide,backend]=await Promise.all([
 read('apps/clock/src/auth/StarryAccountPanel.tsx'),
 read('web-preview/index.html'),
 read('AGENTS.md'),
 read('services/clock-api/src/index.mjs')
]);
const officialName='繁星電池艙 Starry Battery';
const officialDefinition='會員共用的消費用量月額度';
test('native and web use the latest owner-approved Battery name and monthly consumption definition',()=>{
 for(const [platform,code] of [['Expo',native],['Web',web]]){
  assert.ok(code.includes(officialName),platform+' is missing official name');
  assert.ok(code.includes(officialDefinition),platform+' is missing owner definition');
  assert.ok(code.includes('AI 與非 AI'),platform+' must recognize non-AI uses');
  assert.ok(code.includes('每月 1 日'),platform+' must show monthly reset');
 }
 assert.ok(guide.includes(officialName)&&guide.includes(officialDefinition));
});
test('both platforms show the same authorized member balance fields without client-side deduction',()=>{
 assert.ok(native.includes("('GET','/v1/me/battery')"), 'native missing official SDK member Battery GET');
 assert.ok(web.includes("request('GET','/v1/me/battery'"), 'web missing official SDK member Battery GET');
 for(const key of ['allowance','used','reserved','remaining','period']){
  assert.ok(native.includes('bal.'+key),'native missing '+key);
  assert.ok(web.includes('bal.'+key),'web missing '+key);
 }
 assert.doesNotMatch(native,/x-starry-app-key|STARRY_BATTERY_KEY/);
 assert.doesNotMatch(web,/x-starry-app-key|STARRY_BATTERY_KEY/);
 assert.ok(backend.includes("taskType='clock.ai'"));
 assert.ok(backend.includes("clock.preset_create"),'non-AI task type must be handled distinctly');
});


test('2026-11-07.9 integration: iOS and Web show quantum, permanent deletion and support',async()=>{
 const [nativePanel,nativeScreen,webHtml,nativeConfig,contract]=await Promise.all([
  read('apps/clock/src/auth/StarryAccountPanel.tsx'),
  read('apps/clock/app/index.tsx'),
  read('web-preview/index.html'),
  read('apps/clock/app.json'),
  read('contracts/starry-id.v1.json')
 ]);
 const cfg=JSON.parse(nativeConfig).expo;
 assert.deepEqual(cfg.ios.associatedDomains,['webcredentials:id.starry.phd']);
 assert.equal(cfg.ios.bundleIdentifier,'phd.starry.clock');
 assert.equal(cfg.android.package,'phd.starry.clock');
 for(const [platform,source] of [['Expo',nativePanel],['Web',webHtml]]){
  assert.match(source,/量子電池/,platform+' should show per-app quantum balance');
  assert.match(source,/永久刪除/,platform+' must explain irreversible deletion');
  assert.doesNotMatch(source,/7 天內可撤回|7 天撤回期/,platform+' must not promise legacy 7-day grace');
  assert.match(source,/聯絡客服|contactSupport/,platform+' needs support entry');
  assert.match(source,/app_version/,platform+' needs app version metadata');
  assert.match(source,/device=/,platform+' needs minimal device metadata');
 }
 assert.match(nativeScreen,/checkCentralGate/);
 assert.match(nativeScreen,/result\.notices\.map\(n=>n\.message\)/);
 assert.match(webHtml,/checkAppGate/);
 assert.match(webHtml,/gate\.notices\.map\(n=>n\.message\)/);
 assert.match(webHtml,/centralNotice'\)\.textContent=notices/,'announcements must remain plain text');
 const paths=JSON.parse(contract).paths;
 assert.ok(paths['/v1/auth/passkey'],'contract must describe central passkeys');
 assert.ok(paths['/v1/me/passkeys'],'contract must include member passkey management');
});


test('Expo SDK migration keeps existing member sessions and does not duplicate token refresh',async()=>{
 const [session,client]=await Promise.all([
  read('apps/clock/src/auth/session.ts'),
  read('apps/clock/src/auth/starry-client.ts')
 ]);
 assert.match(session,/new StarryClient\(/);
 assert.match(session,/if\(key==='starry\.refresh\.clock'\)return REFRESH;/,'existing signed-in devices must retain their refresh token');
 assert.match(session,/starry\.signInWithRelay/);
 assert.match(session,/starry\.beginRelayRedirect/);
 assert.match(session,/starry\.completeRelayRedirect/);
 assert.match(session,/starry\.getAccessToken\(\)/);
 assert.match(session,/starry\.refresh\(\)/);
 assert.match(session,/SecureStore\.deleteItemAsync\(legacyAccess\)/,'obsolete on-disk access tokens must be purged');
 assert.doesNotMatch(session,/async function rotateToken|async function saveTokens|let refreshPromise/, 'do not keep a competing refresh controller');
 assert.match(client,/export class StarryClient/);
 assert.match(client,/private refreshing: Promise<string \| null> \| null/);
 assert.match(client,/async signInWithPasskey\(\)/);
 assert.match(client,/async registerPasskey\(/);
 assert.match(client,/async checkApp\(/);
 assert.doesNotMatch(client,/sbk_[A-Za-z0-9_-]{43}/);
});
