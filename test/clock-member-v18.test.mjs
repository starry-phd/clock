import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script, runInNewContext} from 'node:vm';
const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8');

const [native,web,cspSource,contract,core]=await Promise.all([
 read('apps/clock/src/auth/StarryAccountPanel.tsx'),
 read('web-preview/index.html'),
 read('tools/build_worker.py'),
 read('contracts/starry-id.v1.json'),
 read('apps/clock/app/index.tsx')
]);
const schemas=JSON.parse(contract).components.schemas;

test('v18: official generated OpenAPI describes Starry avatar, initials, mutable member number',()=>{
 for(const f of ['avatar_url','initials'])assert.ok(schemas.Profile.properties[f],f);
 assert.ok(schemas.Me.properties.member_no,'member_no comes from GET /v1/me');
 assert.ok(schemas.Me.properties.user_id,'backend uses stable user_id');
});
test('v18: Expo and Web use exact fresh avatar URL, server initials, no independent avatar store',()=>{
 assert.match(native,/await loadMember\(\)/,'reload member data on account entry');
 assert.match(native,/centralAvatar\(me\?\.profile\?\.avatar_url\)/,'Expo must use signed avatar returned by Starry ID');
 assert.match(native,/block\.avatar\.initials/,'Expo uses SDK-provided, server-calculated initials');
 assert.match(native,/onError=\{\(\)=>setAvatarFailed\(true\)\}/,'Expo must fall back when avatar fails');
 assert.match(web,/await requireWebSdk\(\)\.me\(\)/,'Web refreshes member from central');
 assert.match(web,/member\.profile\?\.avatar_url/,'Web must use signed profile avatar');
 assert.match(web,/member\.profile\?\.initials/,'Web must use server-calculated initials');
 assert.match(web,/img\.addEventListener\('error',fallback/,'Web must fall back when avatar fails');
 assert.match(web,/img\.referrerPolicy='no-referrer'/);
 assert.match(cspSource,/img-src 'self' data: https:\/\/id\.starry\.phd/);
 assert.doesNotMatch(native,/PUT \/v1\/me\/avatar|uploadAvatar\(/);
 assert.doesNotMatch(web,/PUT \/v1\/me\/avatar|uploadAvatar\(/);
});
test('v18: public member number is a mutable handle, share links are current and canonical',()=>{
 for(const source of [native,web]){
  assert.match(source,/\^\[A-Z\]\{2\}\\d\{7,10\}\$/,'memberNo supports 7-10 digits');
  assert.match(source,/Invite\//,'canonical invitation URL with mandatory slash');
  assert.match(source,/encodeURIComponent\(no\)|encodeURIComponent\(memberNo\)/,'URL-encode public member number');
  assert.match(source,/member_no/);
  assert.match(source,/user_id/,'internal user_id is retained for member-owned data');
 }
 assert.match(native,/Share\.share\(\{message:inviteUrl\}\)/,'Expo must use native sharing menu');
 assert.match(web,/navigator\.share\(\{url\}\)/,'Web must use platform share when supported');
 assert.match(web,/requireWebSdk\(\)\.me\(\)/,'Web must read changed number when sharing');
 assert.match(web,/navigator\.clipboard\?\.writeText/,'Web clipboard fallback');
 assert.doesNotMatch(web,/localStorage\.setItem\([^\n]*member_no/);
});
test('v18: all platforms distinguish ordinary and quantum Battery pictograms',()=>{
 for(const [name,src] of [['Expo',native],['Web',web]]){
  assert.match(src,/🔋 .*顆普通電池/,name+' ordinary balance');
  assert.match(src,/⚛️ .*顆量子電池/,name+' Quantum balance');
  assert.ok(src.includes('starrySettingsBlocks')||src.includes('sdkModuleSettings'),'platform uses official SDK battery block');
 }
 assert.match(core,/🔋/,'the timer screen must show the ordinary Battery icon');
 assert.match(web,/🔋 Clock 超級管理員/);
});
test('v18: Web member header displays centrally supplied initials when avatar is absent',()=>{
 const begin=web.indexOf('let displayedAvatarPath=null;');
 const end=web.indexOf('/* Passkey:',begin);
 assert.ok(begin>=0&&end>begin,'find Web account rendering code');
 const code=web.slice(begin,end);
 new Script(code); // parse without browser APIs first
 const nodes=new Map(),classes=new Map();
 function node(id){
  if(!nodes.has(id)){
   const obj={id,textContent:'',href:'',children:[],
    classList:{toggle:(className,flag)=>{classes.set(id+':'+className,flag)}},
    replaceChildren(){this.children=[]},append(x){this.children.push(x)}};
   nodes.set(id,obj);
  }
  return nodes.get(id);
 }
 const document={createElement(tag){return {
  tagName:tag,textContent:'',style:{cssText:''},addEventListener(){},
  set src(x){this._src=x},get src(){return this._src},
  referrerPolicy:'',alt:''};}};
 const member={user_id:'uuid-not-a-public-link',member_no:'TW0123456',status:'active',
  consent:{required:false},profile:{display_name:'測試會員',initials:'測',avatar_url:null}};
 const ctx={$:node,window:{isSecureContext:false},navigator:{},document,STAR:'https://id.starry.phd',URL,webPasskeysSupported:()=>false};
 runInNewContext(code+'\nsetMemberButtons(member);', {...ctx,member});
 assert.equal(node('memberNumber').textContent,'會員編號：TW0123456');
 assert.equal(node('publicProfile').href,'https://id.starry.phd/TW0123456');
 assert.equal(node('memberAvatar').children[0].textContent,'測','initials must come from server');
 assert.equal(classes.get('memberLinks:hidden'),false);
 runInNewContext(code+'\nsetMemberButtons(null);',ctx);
 assert.equal(node('memberAvatar').children[0].textContent,'?','signout must clear previous avatar');
 assert.equal(classes.get('memberLinks:hidden'),true);
});
