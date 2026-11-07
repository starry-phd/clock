import {handleClock} from './routes.mjs';
import {Starry} from './starry-sdk.ts';
// Clock optional backend: no charge-enabled endpoints, no Starry ID changes.
// Starry Battery = member-shared monthly consumption quota (AI + approved non-AI).
const ID = 'https://id.starry.phd';
function b64(raw) {
  if(!/^[A-Za-z0-9_-]+$/.test(raw)) throw Error('invalid_token');
  const s=raw.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),x=>x.charCodeAt(0));
}
function part(encoded){return JSON.parse(new TextDecoder().decode(b64(encoded)))}
export async function verifyStarryJWT(token,jwks,now=Math.floor(Date.now()/1000)){
  if(typeof token!=='string'||token.length>16384)throw Error('invalid_token');
  const parts=token.split('.');
  if(parts.length!==3)throw Error('invalid_token');
  const header=part(parts[0]),claims=part(parts[1]),signature=b64(parts[2]);
  if(header.alg!=='ES256'||!header.kid||signature.length!==64)throw Error('invalid_algorithm');
  if(claims.iss!=='starry-id:production'||!(claims.aud==='starry'||Array.isArray(claims.aud)&&claims.aud.includes('starry'))||claims.app_id!=='clock')throw Error('invalid_claims');
  if(!Number.isInteger(claims.exp)||claims.exp<=now||claims.nbf>now)throw Error('expired');
  if(typeof claims.sub!=='string'||!claims.sub)throw Error('missing_sub');
  const key=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='EC'&&k.crv==='P-256'&&(!k.alg||k.alg==='ES256'));
  if(!key)throw Error('unknown_key');
  const imported=await crypto.subtle.importKey('jwk',{...key,key_ops:['verify'],ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const ok=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},imported,signature,new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!ok)throw Error('invalid_signature');
  return claims;
}
// Cache public keys briefly; unknown kid forces a fresh pull for key rotation.
// Never cache or log tokens. A JWKS outage on cache miss fails closed.
const JWKS_TTL_MS=5*60*1000;
let jwksCache=null;
let jwksUntil=0;
async function readJWKS(fetchFn,force=false){
  if(!force&&jwksCache&&Date.now()<jwksUntil)return jwksCache;
  const r=await fetchFn(ID+'/.well-known/jwks.json',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('starry_jwks_unavailable');
  const keys=await r.json();
  if(!Array.isArray(keys?.keys))throw Error('starry_jwks_invalid');
  jwksCache=keys;
  jwksUntil=Date.now()+JWKS_TTL_MS;
  return keys;
}
export async function verifyAccessViaJWKS(accessToken,fetchFn=fetch){
  const keys=await readJWKS(fetchFn);
  try{return await verifyStarryJWT(accessToken,keys);}
  catch(error){
    if(error?.message!=='unknown_key')throw error;
    // A rotated central signing key may arrive before the cache expires.
    return verifyStarryJWT(accessToken,await readJWKS(fetchFn,true));
  }
}
// AI task helper is staged only; owner has not registered AI products for Clock.
// Use official Starry SDK, preserving idempotency and never releasing an ambiguous commit.
export async function runBatteryBackedTask({memberToken,taskType='clock.ai',units,idempotencyKey,execute,env,fetchFn=fetch}){
 if(!env?.STARRY_BATTERY_KEY)throw Error('battery_key_missing');
 if(!/^clock\.[a-z][a-z0-9_-]{1,31}$/.test(taskType))throw Error('invalid_task_type');
 if(!Number.isInteger(units)||units<1||units>30)throw Error('invalid_units');
 if(typeof idempotencyKey!=='string'||idempotencyKey.length<8||idempotencyKey.length>128)throw Error('invalid_idempotency');
 if(typeof execute!=='function')throw Error('ai_executor_missing');
 await verifyAccessViaJWKS(memberToken,fetchFn);
 const client=new Starry({baseUrl:ID,serviceKey:env.STARRY_BATTERY_KEY,fetch:fetchFn});
 const reservation=await client.reserve(memberToken,{taskType,taskLabel:taskType,units,idempotencyKey});
 if(reservation.replayed)throw Error('battery_request_in_progress_or_replayed');
 if(!reservation.reservation_id||reservation.status!=='reserved'||reservation.task_type!==taskType)throw Error('reservation_failed');
 if(taskType==='clock.preset_create'&&(reservation.units!==units||reservation.amount!==units)){
  try{await client.release(reservation.reservation_id)}catch{}
  throw Error('battery_price_mismatch');
 }
 let output;
 try{output=await execute();}
 catch(error){try{await client.release(reservation.reservation_id)}catch{};throw error}
 // If commit times out, DO NOT release: it may already have succeeded.
 await client.commit(reservation.reservation_id,units);
 return output;
}
export default {
 async fetch(request,env){
  return handleClock(request,env,async(accessToken)=>{
   if(env?.BATTERY_CHARGES_ENABLED==='true'||request.method!=='GET'){
     // Every sensitive action checks fresh Starry JWKS; fail closed if unavailable.
     return verifyAccessViaJWKS(accessToken);
   }
   return verifyAccessViaJWKS(accessToken);
  });
 }
};
