import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {handleClock} from '../services/clock-api/src/routes.mjs';
const files=async(...paths)=>Promise.all(paths.map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
const env={
 BATTERY_CHARGES_ENABLED:'false',
 DB:{prepare(sql){return{bind(...args){return{
  first:async()=>({feature:'clock.preset.create',label:'第 4 組起新增計時器',units:2,enabled:0,version:1}),
  all:async()=>({results:[{feature:'clock.preset.create',label:'新增第 4 組',units:2,enabled:0,version:1}]}),
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
