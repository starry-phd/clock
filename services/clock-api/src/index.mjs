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
export async function verifyAccessViaJWKS(accessToken,fetchFn=fetch){
  const r=await fetchFn(ID+'/.well-known/jwks.json',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('starry_jwks_unavailable');
  return verifyStarryJWT(accessToken,await r.json());
}
async function batteryFetch(path,body,token,key,fetchFn){
  const headers={Accept:'application/json','x-starry-app-key':key};
  if(token)headers.Authorization='Bearer '+token;
  if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetchFn(ID+path,{method:'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('starry_battery_http_'+r.status);
  return r.json();
}
// This helper is not connected to any route until owner approves an AI product and service costs.
export async function runBatteryBackedTask({memberToken,taskType='clock.ai',units,idempotencyKey,execute,env,fetchFn=fetch}){
  if(!env?.STARRY_BATTERY_KEY)throw Error('battery_key_missing');
  if(!/^clock\.[a-z][a-z0-9.]{1,56}$/.test(taskType))throw Error('invalid_task_type');
  if(!Number.isInteger(units)||units<1||units>30)throw Error('invalid_units');
  if(typeof idempotencyKey!=='string'||idempotencyKey.length<8||idempotencyKey.length>128)throw Error('invalid_idempotency');
  if(typeof execute!=='function')throw Error('ai_executor_missing');
  // If Starry ID cannot be contacted, fail closed BEFORE any AI work.
  await verifyAccessViaJWKS(memberToken,fetchFn);
  const key=env.STARRY_BATTERY_KEY;
  const reservation=await batteryFetch('/v1/battery/reservations',{task_type:taskType,units,idempotency_key:idempotencyKey},memberToken,key,fetchFn);
  // Retry must not execute a side effect twice; central will resolve/expire the original.
  if(reservation.replayed)throw Error('battery_request_in_progress_or_replayed');
  if(!reservation.reservation_id||reservation.status!=='reserved'||reservation.task_type!==taskType)throw Error('reservation_failed');
  // Clock X means actual batteries charged. Central task rate must remain one per unit.
  if(taskType==='clock.preset.create' && (reservation.units!==units||reservation.amount!==units)){
    try{await batteryFetch('/v1/battery/reservations/'+encodeURIComponent(reservation.reservation_id)+'/release',undefined,null,key,fetchFn);}catch{}
    throw Error('battery_price_mismatch');
  }
  let committed=false;
  try{
    const output=await execute();
    await batteryFetch('/v1/battery/reservations/'+encodeURIComponent(reservation.reservation_id)+'/commit',{units},null,key,fetchFn);
    committed=true;
    return output;
  }catch(error){
    if(!committed){
      try{await batteryFetch('/v1/battery/reservations/'+encodeURIComponent(reservation.reservation_id)+'/release',undefined,null,key,fetchFn);}catch{}
    }
    throw error;
  }
}
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
export default {async fetch(request){
  if(new URL(request.url).pathname==='/health')return reply({status:'ok',service:'clock-api',app_id:'clock',ai_enabled:false});
  return reply({error:{code:'NOT_AVAILABLE',message:'Clock AI task not enabled'}},404);
}};
