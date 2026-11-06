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
