import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script,runInNewContext} from 'node:vm';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Clock Web PWA has complete Passkey actions, secure fallback and no central secret',async()=>{
 const html=await read('web-preview/index.html');
 const script=html.split('<script>')[1]?.split('</script>')[0]??'';
 assert.doesNotThrow(()=>new Script(script),'inline Web code must compile after Passkey changes');
 for(const id of ['loginPasskey','passkeyPanel','addPasskey','reloadPasskeys','passkeyList'])
  assert.ok(html.includes('id="'+id+'"'),'Missing Web Passkey UI: '+id);
 for(const endpoint of ['/v1/auth/passkey/options','/v1/auth/passkey',
  '/v1/me/passkeys/options','/v1/me/passkeys'])
  assert.ok(html.includes(endpoint),'Missing Starry ID Passkey endpoint: '+endpoint);
 assert.match(html,/navigator\.credentials\.get\(/,'Web must use OS Passkey prompt');
 assert.match(html,/navigator\.credentials\.create\(/,'Web must use OS Passkey registration');
 assert.match(html,/RP id|rpId|rp\.id/);
 assert.match(html,/if\(!webPasskeysSupported\(\)\)/);
 assert.match(html,/for\(const id of \['loginGoogle','loginApple'\]\)/,'Google/Apple login must remain available');
 assert.doesNotMatch(html,/STARRY_BATTERY_KEY|x-starry-app-key|sbk_[A-Za-z0-9_-]{30,}/);
});
test('Web passkey transforms central base64url options without changing RP id',async()=>{
 const html=await read('web-preview/index.html');
 const script=html.split('<script>')[1].split('</script>')[0];
 const start=script.indexOf('function fromBase64url(');
 const end=script.indexOf('function friendlyPasskeyError(',start);
 assert.ok(start>0&&end>start);
 const helpers=script.slice(start,end)+'\nconst parsed=publicKeyOptions({rpId:"id.starry.phd",challenge:"AQID",allowCredentials:[{type:"public-key",id:"BAUG"}]},"get");'+
  '\nconst created=publicKeyOptions({rp:{id:"id.starry.phd",name:"Starry"},user:{id:"AQID",name:"member"},challenge:"BAUG",excludeCredentials:[]},"create");'+
  '\nconst mismatch=(()=>{try{publicKeyOptions({rpId:"evil.invalid",challenge:"AQID"},"get");return false;}catch{return true}})();'+
  '\nconst badCreate=(()=>{try{publicKeyOptions({rp:{id:"evil.invalid"},user:{id:"AQID"},challenge:"AQID"},"create");return false;}catch{return true}})();'+
  '\n({parsed,created,mismatch,badCreate})';
 const ctx={atob,btoa,Uint8Array};
 const out=runInNewContext(helpers,ctx);
 assert.deepEqual([...out.parsed.challenge],[1,2,3]);
 assert.deepEqual([...out.parsed.allowCredentials[0].id],[4,5,6]);
 assert.equal(out.parsed.rpId,'id.starry.phd');
 assert.deepEqual([...out.created.user.id],[1,2,3]);
 assert.equal(out.mismatch,true,'must reject a foreign login RP');
 assert.equal(out.badCreate,true,'must reject a foreign credential creation RP');
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
