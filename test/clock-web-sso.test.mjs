import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const js=await readFile(new URL('../web-preview/starry-client.js',import.meta.url),'utf8');
const context={TextEncoder,TextDecoder,URLSearchParams,URL,Uint8Array,ArrayBuffer,atob,btoa,Response};
context.globalThis=context;
runInNewContext(js,context,{timeout:2000});
const {StarryClient,memoryStorage}=context.StarrySDK;
const jwt=user=>{
 const h=Buffer.from(JSON.stringify({alg:'ES256'})).toString('base64url');
 const p=Buffer.from(JSON.stringify({sub:user})).toString('base64url');
 return h+'.'+p+'.test';
};

test('Web SSO: login adopts central browser cookie, checking throttles, and switching member exchanges own Clock tokens',async()=>{
 const origin='https://clock.starry.phd/',urls=[],requests=[];
 let clock=0;
 const pair=user=>({access_token:jwt(user),refresh_token:'refresh-'+user+'-'+(++clock),expires_in:3600,user:{user_id:user,status:'active',is_new:false,deletion_purge_at:null},consent_required:false});
 const fetchFn=async(url,opts)=>{
  const path=new URL(url).pathname,body=opts.body?JSON.parse(opts.body):{};
  requests.push({path,body});
  if(path==='/v1/auth/google')return Response.json(pair('alice'));
  if(path==='/v1/auth/sso/start')return Response.json({sso_token:'token-alice'});
  if(path==='/v1/auth/sso/web-code')return Response.json({code:'adopt-1'});
  if(path==='/v1/auth/nonce')return Response.json({nonce:'n'.repeat(40)});
  if(path==='/v1/auth/sso/web-exchange')return Response.json(pair('bob'));
  if(path==='/v1/auth/logout')return Response.json({});
  throw Error('Unexpected SDK call '+path);
 };
 const storage=memoryStorage();
 const client=new StarryClient({
  appId:'clock',baseUrl:'https://id.starry.phd',storage,fetch:fetchFn,
  sha256Hex:async()=>'a'.repeat(64),randomState:()=>'clock-sso-state',
  navigate:url=>urls.push(url),
  now:()=>1_797_000_000_000
 });
 await client.signInWithIdToken('google',{idToken:'idtoken',nonce:'nonce'});
 await client.shareWebSignIn({returnUrl:origin});
 assert.match(urls.at(-1),/\/auth\/sso\/adopt\?/);
 const adopt=new URL(urls.at(-1));
 assert.equal(adopt.searchParams.get('return'),origin);
 assert.equal(adopt.searchParams.get('c'),'adopt-1');
 assert.equal(await storage.get('starry.ssoweb.clock'),'1');
 const left=await client.syncWebSignIn({returnUrl:origin});
 assert.equal(left,true);
 const check=new URL(urls.at(-1));
 assert.equal(check.pathname,'/auth/sso/check');
 assert.equal(check.searchParams.get('nonce'),'a'.repeat(64));
 assert.equal(check.searchParams.get('return'),origin);
 assert.equal(await client.syncWebSignIn({returnUrl:origin}),false,'SDK throttles checks to five minutes');
 assert.equal(urls.length,2,'second check must not redirect');
 const switched=await client.completeWebSsoCheck(origin+'#sso_code=one-time&sso_user=bob&state=clock-sso-state');
 assert.equal(switched,true);
 assert.equal((await storage.get('starry.refresh.clock')).startsWith('refresh-bob'),true);
 assert.equal(requests.find(x=>x.path==='/v1/auth/sso/web-exchange')?.body?.app_id,'clock');
 assert.equal(requests.find(x=>x.path==='/v1/auth/sso/web-exchange')?.body?.nonce,'n'.repeat(40));
 assert.equal(await client.getAccessToken(),jwt('bob'));
 await client.signOutWebEverywhere({returnUrl:origin});
 assert.equal(await storage.get('starry.refresh.clock'),null,'logout clears own token');
 assert.equal(await storage.get('starry.ssoweb.clock'),null,'logout clears shared browser marker');
 assert.equal(new URL(urls.at(-1)).pathname,'/auth/sso/logout');
 assert.equal(new URL(urls.at(-1)).searchParams.get('return'),origin);
});

test('Web SSO: central sign-out closes linked Clock session without triggering further requests',async()=>{
 const storage=memoryStorage();
 await storage.set('starry.refresh.clock','legacy-refresh');
 await storage.set('starry.ssoweb.clock','1');
 const client=new StarryClient({appId:'clock',baseUrl:'https://id.starry.phd',storage,fetch:()=>{throw Error('no network should be necessary')}});
 const signedIn=await client.completeWebSsoCheck('https://clock.starry.phd/#sso_none=1');
 assert.equal(signedIn,false);
 assert.equal(await storage.get('starry.refresh.clock'),null);
 assert.equal(await storage.get('starry.ssoweb.clock'),null);
});

test('Web SSO: unsigned or mismatched code cannot switch member or leak tokens to return URL',async()=>{
 const storage=memoryStorage();
 await storage.set('starry.refresh.clock','existing-member-refresh');
 let calls=0;
 const client=new StarryClient({appId:'clock',baseUrl:'https://id.starry.phd',storage,
  fetch:()=>{calls++;throw Error('unauthorized request')},navigate:()=>{throw Error('unwanted redirect')}});
 const result=await client.completeWebSsoCheck('https://clock.starry.phd/#sso_code=fake&sso_user=other&state=attacker');
 assert.equal(result,true,'unmatched SSO callback preserves existing member session');
 assert.equal(calls,0);
 assert.equal(await storage.get('starry.refresh.clock'),'existing-member-refresh');
});
