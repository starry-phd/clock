import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {handleClock} from '../services/clock-api/src/routes.mjs';
const files=async(...paths)=>Promise.all(paths.map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
const env={
 BATTERY_CHARGES_ENABLED:'false',
 DB:{prepare(sql){return{bind(...args){return{
  first:async()=>({feature:'clock.preset_create',label:'第 4 組起新增計時器',units:2,enabled:0,version:1}),
  all:async()=>({results:[{feature:'clock.preset_create',label:'新增第 4 組',units:2,enabled:0,version:1}]}),
  run:async()=>({meta:{changes:0}})
 }}}}}
};
test('Clock API safe mode: health and public pricing without Battery charges',async()=>{
 const health=await handleClock(new Request('https://clock-api.example/health'),env,async()=>{throw Error('should not auth')});
 assert.equal(health.status,200);
 const data=await health.json();
 assert.equal(data.charging_enabled,false);
 assert.equal(data.battery_definition,'會員共用的消費用量月額度');
 const price=await handleClock(new Request('https://clock-api.example/v1/pricing'),env,async()=>{throw Error('should not auth')});
 assert.equal(price.status,200);
 const p=await price.json();
 assert.equal(p.free_presets,3);
 assert.equal(p.features[0].available,false);
});
test('Clock API fails closed on authentication/role and unauthorized CORS',async()=>{
 const adminUrl='https://clock-api.example/v1/admin/pricing';
 const anon=await handleClock(new Request(adminUrl),env,async()=>({sub:'fake',app_id:'clock'}));
 assert.equal(anon.status,401);
 const signed=await handleClock(new Request(adminUrl,{headers:{Authorization:'Bearer test'}}),env,async()=>({sub:'member-1',app_id:'clock'}));
 assert.equal(signed.status,403);
 const origin=await handleClock(new Request('https://clock-api.example/v1/pricing',{headers:{Origin:'https://evil.invalid'}}),env,async()=>null);
 assert.equal(origin.status,403);
});
test('Expo and Web both implement explicit paid preset charge and Owner dashboard',async()=>{
 const [native,web,nativeApi,owner,backend]=await files(
  'apps/clock/app/index.tsx',
  'web-preview/index.html',
  'apps/clock/src/auth/clockApi.ts',
  'apps/clock/src/auth/OwnerPricingPanel.tsx',
  'services/clock-api/src/routes.mjs'
 );
 for(const [name,client] of [['Expo',native],['Web',web]]){
  assert.ok(client.includes('presets.length>=3'),name+' must gate fourth preset');
  assert.ok(client.includes('accepted_units')||client.includes('createChargedPreset'),name+' must confirm price');
  assert.ok(client.includes('removeCloudPreset')||client.includes("clockReq('/v1/presets/"),name+' must delete cloud member preset');
 }
 assert.match(nativeApi,/\/v1\/admin\/pricing/);
 assert.match(owner,/Owner|超級管理員/);
 assert.match(web,/ownerPricing/);
 assert.match(backend,/CLOCK_OWNER_USER_IDS/);
 assert.match(backend,/BATTERY_CHARGES_ENABLED/);
 assert.match(backend,/reservation_id/);
 assert.match(backend,/battery_price_mismatch|BATTERY_PRICE_MISMATCH/);
 assert.doesNotMatch(native,/STARRY_BATTERY_KEY/);
 assert.doesNotMatch(web,/STARRY_BATTERY_KEY/);
 const script=web.split('<script>')[1].split('</script>')[0];
 assert.doesNotThrow(()=>new Script(script),'Web inline JavaScript must compile');
});


test('battery outage: native and web explicitly replace an existing preset for free without appending or charging',async()=>{
 const [native,web]=await files('apps/clock/app/index.tsx','web-preview/index.html');
 assert.match(web,/id="freeReplacePanel"/);
 assert.match(web,/id="freeReplaceTarget"/);
 assert.match(web,/id="freeReplaceSave"/);
 assert.match(web,/async function replaceFree\(\)/);
 assert.match(web,/presets=presets\.map\(p=>p\.id===target\.id\?updated:p\)/);
 assert.match(web,/if\(cloudPresetIds\.has\(target\.id\)\)/);
 assert.match(web,/不會增加計時器數量，也不會消耗任何 🔋 普通電池/);
 assert.match(native,/const replaceFree=useCallback/);
 assert.match(native,/setPresets\(old=>old\.map\(p=>p\.id===target\.id\?next:p\)\)/);
 assert.match(native,/if\(cloudIds\.includes\(target\.id\)\)await editCloudPreset\(next\)/);
 assert.match(native,/免費取代既有用途（不新增、不扣 🔋 普通電池）/);
 assert.match(native,/不會增加第 4 組，也不會消耗任何 🔋 普通電池/);
});


// These are isolated D1/Starry HTTP doubles: they never touch the central DB,
// real member tokens, a paid service, or an actual Cloudflare staging environment.
function fakeClockDb(){
 const pricing={feature:'clock.preset_create',label:'第 4 組起新增計時器',units:2,enabled:1,version:9};
 const requests=new Map(),presets=new Map();
 const key=(u,id)=>u+':'+id;
 return {pricing,requests,presets,prepare(sql){
  return {bind(...args){
   return {
    async first(){
     if(sql.includes('FROM clock_pricing WHERE feature='))return pricing;
     if(sql.includes('FROM clock_requests WHERE user_id='))return requests.get(key(args[0],args[1]))||null;
     if(sql.includes('FROM clock_presets WHERE user_id=')){
      const rec=[...presets.values()].find(x=>x.user_id===args[0]&&x.request_id===args[1]&&x.state==='active');
      return rec?{id:rec.preset_id,name:rec.name,durationSeconds:rec.duration_seconds,paidUnits:rec.paid_units}:null;
     }
     throw Error('Unknown D1 first: '+sql);
    },
    async all(){
     if(sql.includes('FROM clock_free_presets'))return {results:[0,1,2].map(slot=>({slot,id:['break','opening','speech'][slot],name:'免費',durationSeconds:300,version:1}))};
     return {results:[pricing]};
    },
    async run(){
     let changes=0;
     if(sql.startsWith('INSERT OR IGNORE INTO clock_requests')){
      const [user_id,request_id,preset_id,payload_hash,state,charge_units]=args;
      const k=key(user_id,request_id);
      if(!requests.has(k)){requests.set(k,{user_id,request_id,preset_id,payload_hash,state,charge_units,reservation_id:null});changes=1;}
     }else if(sql.startsWith('INSERT OR IGNORE INTO clock_presets')){
      const [user_id,preset_id,name,duration_seconds,request_id]=args;
      const k=key(user_id,request_id);
      if(!presets.has(k)){presets.set(k,{user_id,preset_id,name,duration_seconds,request_id,state:'pending',paid_units:0});changes=1;}
     }else if(sql.startsWith('UPDATE clock_requests SET reservation_id=')){
      const rec=requests.get(key(args[2],args[3]));
      if(rec){rec.reservation_id=args[0];changes=1;}
     }else if(sql.startsWith("UPDATE clock_presets SET state='active',paid_units=")){
      const rec=presets.get(key(args[2],args[3]));
      if(rec){rec.state='active';rec.paid_units=args[0];changes=1;}
     }else if(sql.startsWith("UPDATE clock_requests SET state='committed'")){
      const rec=requests.get(key(args[1],args[2]));
      if(rec){rec.state='committed';changes=1;}
     }else if(sql.startsWith('UPDATE clock_requests SET state=?')){
      const rec=requests.get(key(args[3],args[4]));
      if(rec){rec.state='failed';rec.error_code=args[1];changes=1;}
     }else if(sql.startsWith("DELETE FROM clock_presets WHERE")){
      const rec=presets.get(key(args[0],args[1]));
      if(rec?.state==='pending'){presets.delete(key(args[0],args[1]));changes=1;}
     }else{
      throw Error('Unknown D1 run: '+sql);
     }
     return {meta:{changes}};
    }
   };
  }};
 }};
}
test('central v2 contract: X units charged once, Owner price changes do not break replay, rejected reservations do not save',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.crypto??=(await import('node:crypto')).webcrypto;
 let centralMode='ok',centralRole='owner',reserved=0,committed=0,released=0;
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
 globalThis.fetch=async(input,init={})=>{
  const path=new URL(String(input)).pathname;
  if(path==='/v1/me')return response({staff_role:centralRole});
  if(path==='/v1/battery/reservations'){
   const b=JSON.parse(init.body);
   assert.equal(b.task_type,'clock.preset_create');
   assert.equal(b.task_label,'第 4 組起新增計時器');
   assert.equal(b.units,2);
   reserved++;
   if(centralMode==='cap')return response({error:{code:'BATTERY_APP_CAP'}},409);
   if(centralMode==='maintenance')return response({error:{code:'SERVICE_UNAVAILABLE'}},503);
   if(centralMode==='insufficient')return response({error:{code:'BATTERY_INSUFFICIENT'}},409);
   return response({reservation_id:'test-reservation-'+reserved,task_type:b.task_type,status:'reserved',units:2,amount:centralMode==='mismatch'?4:2,replayed:false},201);
  }
  if(path.endsWith('/commit')){committed++;return response({status:'committed',charged:2});}
  if(path.endsWith('/release')){released++;return response({status:'released'});}
  throw Error('Unexpected central path: '+path);
 };
 const makeEnv=(db)=>({DB:db,STARRY_BATTERY_KEY:'mock-only-not-a-secret',CLOCK_OWNER_USER_IDS:'member-1',BATTERY_CHARGES_ENABLED:'true'});
 const create=(id)=>new Request('https://clock-api.example/v1/presets',{method:'POST',headers:{authorization:'Bearer mock-member'},body:JSON.stringify({
  preset_id:'preset-'+id,request_id:'request-'+id,name:'專案倒數',duration_seconds:300,accepted_units:2
 })});
 const verify=async()=>({sub:'member-1',app_id:'clock'});
 try{
  const db=fakeClockDb(),env=makeEnv(db);
  const first=await handleClock(create('00001'),env,verify);
  assert.equal(first.status,201,JSON.stringify(await first.clone().json()));
  assert.equal((await first.json()).charged_units,2);
  assert.equal([...db.presets.values()][0].state,'active');
  assert.equal(reserved,1);assert.equal(committed,1);
  // A completed retry is a read, even after the central kill switch and X changed.
  env.BATTERY_CHARGES_ENABLED='false';db.pricing.enabled=0;db.pricing.units=5;
  const replay=await handleClock(create('00001'),env,verify);
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).replayed,true);
  assert.equal(reserved,1);assert.equal(committed,1);
  env.BATTERY_CHARGES_ENABLED='true';
  db.pricing.enabled=1;db.pricing.units=2;
  for(const [mode,id,code] of [['mismatch','00002','BATTERY_PRICE_MISMATCH'],['cap','00003','BATTERY_APP_CAP'],['insufficient','00004','BATTERY_INSUFFICIENT'],['maintenance','00005','SERVICE_UNAVAILABLE']]){
   centralMode=mode;
   const res=await handleClock(create(id),env,verify);
   const data=await res.json();
   assert.equal(res.status,mode==='maintenance'?503:409);
   assert.equal(data.error?.code,code);
   assert.equal([...db.presets.values()].filter(x=>x.state==='active').length,1);
   assert.equal(db.requests.get('member-1:request-'+id)?.state,'failed');
  }
  assert.equal(released,1,'price mismatch releases reservation');
  assert.equal(committed,1,'rejected cases do not commit Battery');
  const ownerPut=()=>new Request('https://clock-api.example/v1/admin/pricing',{method:'PUT',headers:{authorization:'Bearer mock-member'},body:JSON.stringify({feature:'clock.preset_create',units:3,enabled:true,version:9})});
  centralRole='admin';
  const denied=await handleClock(ownerPut(),env,verify);
  assert.equal(denied.status,403,'stale Clock allowlist must not override central Owner revocation');
 }finally{
  globalThis.fetch=oldFetch;
 }
});
