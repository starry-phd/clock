import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto as nodeCrypto} from 'node:crypto';
import {verifyStarryJWT,runBatteryBackedTask} from '../services/clock-api/src/index.mjs';
globalThis.crypto ??= nodeCrypto;
const b64=(value)=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
describe('Clock API signature and Battery safety',()=>{
 it('accepts valid central ES256 JWT and rejects wrong app/issuer',async()=>{
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';jwk.alg='ES256';
  const jwks={keys:[jwk]};
  const header=b64({alg:'ES256',kid:'test-key',typ:'JWT'});
  async function sign(payload){
   const msg=header+'.'+b64(payload);
   const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(msg));
   return msg+'.'+Buffer.from(sig).toString('base64url');
  }
  const base={iss:'starry-id:production',aud:'starry',app_id:'clock',sub:'member-user-id',exp:Math.floor(Date.now()/1000)+120};
  assert.equal((await verifyStarryJWT(await sign(base),jwks)).sub,'member-user-id');
  await assert.rejects(verifyStarryJWT(await sign({...base,app_id:'echo'}),jwks),/invalid_claims/);
  await assert.rejects(verifyStarryJWT(await sign({...base,iss:'fake'}),jwks),/invalid_claims/);
 });
 it('does not begin AI work if Starry ID JWKS cannot be reached',async()=>{
  let called=false;
  await assert.rejects(runBatteryBackedTask({
   memberToken:'nonempty',units:1,idempotencyKey:'task-test-001',
   env:{STARRY_BATTERY_KEY:'test-key-placeholder'},
   execute:async()=>{called=true;return 'bad';},
   fetchFn:async()=>{throw Error('offline');}
  }),/offline/);
  assert.equal(called,false);
 });
 it('rejects empty key or invalid units before any network',async()=>{
  let called=false;
  await assert.rejects(runBatteryBackedTask({memberToken:'test',units:0,idempotencyKey:'task-test-002',execute:async()=>{called=true},env:{STARRY_BATTERY_KEY:'placeholder'}}),/invalid_units/);
  await assert.rejects(runBatteryBackedTask({memberToken:'test',units:1,idempotencyKey:'task-test-002',execute:async()=>{called=true},env:{}}),/battery_key_missing/);
  assert.equal(called,false);
 });
});


it('accepts a separate non-AI task type and prevents undisclosed central price mismatches',async()=>{
 const keypair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keypair.publicKey);
 Object.assign(jwk,{kid:'test-central',alg:'ES256'});
 const header=b64({alg:'ES256',kid:'test-central',typ:'JWT'});
 const claims=b64({iss:'starry-id:production',aud:'starry',app_id:'clock',sub:'member-test',exp:Math.floor(Date.now()/1000)+90});
 const msg=header+'.'+claims;
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keypair.privateKey,new TextEncoder().encode(msg));
 const token=msg+'.'+Buffer.from(sig).toString('base64url');
 const route='/v1/battery/reservations',seen=[];
 const fakeFetch=async(url,options={})=>{
   const path=new URL(url).pathname;
   seen.push({path,body:options.body?JSON.parse(options.body):null});
   if(path==='/.well-known/jwks.json')return {ok:true,json:async()=>({keys:[jwk]})};
   if(path===route)return {ok:true,json:async()=>({reservation_id:'res-1',task_type:'clock.preset_create',status:'reserved',units:2,amount:2,replayed:false})};
   if(path.endsWith('/commit')||path.endsWith('/release'))return {ok:true,json:async()=>({status:path.endsWith('/commit')?'committed':'released'})};
   throw Error('unrecognized mock API: '+path);
 };
 let calls=0;
 const result=await runBatteryBackedTask({memberToken:token,taskType:'clock.preset_create',units:2,idempotencyKey:'preset:create:123',env:{STARRY_BATTERY_KEY:'mock-only'},fetchFn:fakeFetch,execute:async()=>{calls++;return 'preset-created'}});
 assert.equal(result,'preset-created');
 assert.equal(calls,1);
 assert.equal(seen.find(x=>x.path===route)?.body?.task_type,'clock.preset_create');
 assert.equal(seen.filter(x=>x.path.endsWith('/commit')).length,1);
 const wrongPrice=async(url,options={})=>{
  const path=new URL(url).pathname;
  if(path==='/.well-known/jwks.json')return {ok:true,json:async()=>({keys:[jwk]})};
  if(path===route)return {ok:true,json:async()=>({reservation_id:'res-2',task_type:'clock.preset_create',status:'reserved',units:2,amount:4,replayed:false})};
  if(path.endsWith('/release'))return {ok:true,json:async()=>({status:'released'})};
  throw Error('unexpected API');
 };
 await assert.rejects(runBatteryBackedTask({memberToken:token,taskType:'clock.preset_create',units:2,idempotencyKey:'preset:create:456',env:{STARRY_BATTERY_KEY:'mock-only'},fetchFn:wrongPrice,execute:async()=>{calls++;}}),/battery_price_mismatch/);
 assert.equal(calls,1,'must not create a preset when central price is not X');
});
