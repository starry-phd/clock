import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [native,home,web,contract]=await Promise.all([
 read('apps/clock/src/auth/StarryAccountPanel.tsx'),
 read('apps/clock/app/index.tsx'),
 read('web-preview/index.html'),
 read('contracts/starry-id.v1.json')
]);

test('2026-11-08.3: official OpenAPI defines central shown_name for member and directory',()=>{
 const schemas=JSON.parse(contract).components.schemas;
 assert.ok(schemas.Profile.properties.shown_name,'current member primary display name');
 assert.ok(schemas.DirectoryMember.properties.shown_name,'directory primary display name');
 assert.ok(schemas.Profile.properties.avatar_url);
 assert.ok(schemas.Profile.properties.initials);
});

test('2026-11-08.3: both platforms render server-chosen shown_name; fallback is central initials, not real name',()=>{
 assert.match(native,/const shownName=me\?\.profile\?\.shown_name\?\?me\?\.profile\?\.initials\?\?'\?'/);
 assert.match(native,/<Text style=\{s\.name\}>\{block\.name\}<\/Text>/,'native must use SDK chosen shown_name');
 assert.match(web,/member\.profile\?\.shown_name\?\?member\.profile\?\.initials\?\?'\?'/);
 assert.doesNotMatch(native,/<Text style=\{s\.name\}>\{me\.profile\.display_name/);
 assert.doesNotMatch(web,/\$\('accountUser'\)\.textContent=member\?\(member\.profile\?\.display_name/);
});

test('2026-11-08.3: Expo foreground + Web foreground/settings refresh GET /v1/me',()=>{
 assert.match(native,/AppState\.addEventListener\('change',state=>/);
 assert.match(native,/if\(state==='active'\)void refresh\(\)\.catch/);
 assert.match(native,/const member=await loadMember\(\)/);
 assert.match(home,/AppState\.addEventListener\('change'/);
 assert.match(web,/document\.addEventListener\('visibilitychange'/);
 assert.match(web,/void refreshVisibleMember\(\)/);
 assert.match(web,/const member=await requireWebSdk\(\)\.me\(\)/);
 assert.match(web,/if\(type==='settings'\).*refreshVisibleMember/);
});

test('2026-11-08.3: avatar rendering uses exact signed Starry URL but stable path as cache key',()=>{
 assert.match(native,/const url=new URL\(raw,api\)/);
 assert.match(native,/cacheKey:url\.pathname/);
 assert.match(native,/key=\{signedAvatar\.cacheKey\}/);
 assert.match(native,/previousAvatarPath\.current!==nextAvatarPath/);
 assert.match(web,/const url=new URL\(raw,STAR\)/);
 assert.match(web,/cacheKey:url\.pathname/);
 assert.match(web,/displayedAvatarPath!==nextKey/);
 assert.match(web,/img\.src=image\.uri/);
 assert.match(web,/url\.origin!==STAR/);
 assert.match(web,/url\.pathname\.startsWith\('\/v1\/avatars\/'\)/);
 assert.doesNotMatch(native,/key=\{me\?\.user_id\}|key=\{me\.user_id\}/);
});

test('2026-11-08.3: browser profile handles avatar rotation, signed URL renewal and shown_name',()=>{
 const start=web.indexOf('let displayedAvatarPath=null;');
 const end=web.indexOf('/* Passkey:',start);
 assert.ok(start>0&&end>start);
 const source=web.slice(start,end);
 const els=new Map();
 const calls=[];
 function node(id){
  if(!els.has(id))els.set(id,{
   id,textContent:'',children:[],href:'',
   classList:{toggle(){}},
   replaceChildren(){this.children=[]},
   append(v){this.children.push(v)}
  });
  return els.get(id);
 }
 const doc={createElement(tag){
  const el={tag,style:{cssText:''},textContent:'',listeners:{},alt:'',referrerPolicy:'',
   addEventListener(n,fn){this.listeners[n]=fn},
   set src(v){calls.push(v);this._src=v},
   get src(){return this._src}};
  return el;
 }};
 const ctx={URL,STAR:'https://id.starry.phd',$:node,document:doc,
  webPasskeysSupported:()=>false,window:{},navigator:{}};
 runInNewContext(source,ctx,{timeout:1000});
 const member={user_id:'stable-user-uuid',member_no:'TW0123456',status:'active',consent:{required:false},
  profile:{display_name:'不應顯示的本名',shown_name:'選擇的暱稱',initials:'暱',
   avatar_url:'/v1/avatars/user-uuid/old.webp?exp=1&sig=a'}};
 ctx.setMemberButtons(member);
 assert.equal(node('accountUser').textContent,'選擇的暱稱');
 assert.equal(calls.length,1);
 assert.equal(calls[0],'https://id.starry.phd/v1/avatars/user-uuid/old.webp?exp=1&sig=a');
 assert.equal(node('memberAvatar').children[0].alt,'Starry ID 會員頭像');
 member.profile.avatar_url='/v1/avatars/user-uuid/old.webp?exp=2&sig=b';
 ctx.setMemberButtons(member);
 assert.equal(calls.length,1,'new signature on the SAME avatar path does not re-download the picture');
 member.profile.avatar_url='/v1/avatars/user-uuid/new.webp?exp=3&sig=c';
 ctx.setMemberButtons(member);
 assert.equal(calls.length,2,'changed avatar path replaces the displayed picture');
 assert.equal(node('memberAvatar').children[0].src,'https://id.starry.phd/v1/avatars/user-uuid/new.webp?exp=3&sig=c');
 member.profile.avatar_url=null;
 member.profile.shown_name=null;
 ctx.setMemberButtons(member);
 assert.equal(node('accountUser').textContent,'暱','server initials are fallback for missing shown_name');
 assert.equal(node('memberAvatar').children[0].textContent,'暱','server initials replace missing avatar');
 member.profile.avatar_url='https://untrusted.example/v1/avatars/evil.webp?exp=999';
 ctx.setMemberButtons(member);
 assert.equal(calls.length,2,'untrusted avatar origin must not be fetched');
 ctx.setMemberButtons(null);
 assert.equal(node('memberAvatar').children[0].textContent,'?');
});

test('2026-11-08.3: Battery allowance multiplier is central-only; Clock displays returned balance unchanged',()=>{
 for(const [kind,src] of [['native',native],['web',web]]){
  assert.match(src,/\/v1\/me\/battery/);
  assert.match(src,/bal\.allowance/);
  assert.match(src,/bal\.remaining/);
  assert.match(src,/⚛️/);
  assert.doesNotMatch(src,/(?:allowance|remaining)\s*\*\s*(?:multiplier|bonus)/i,kind+' must not multiply Battery');
  assert.doesNotMatch(src,/公開欄位.*(?:倍數|獎勵)|欄位加成.*UI/);
 }
});
