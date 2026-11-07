/**
 * Clock's independent authenticated API. D1 stores Clock data only.
 * Starry Battery is the member's shared monthly CONSUMPTION quota, AI + non-AI.
 * All usage is reserved/committed server-side; no sensitive keys in clients.
 */
import {Starry, StarryError} from './starry-sdk.ts';
const ORIGINS=new Set(['https://clock.starry.phd','https://clock-staging.starry-phd.workers.dev']);
const MAX_EXTRAS=47;
const TASK='clock.preset_create';
const LIMIT=30;
const timerName=n=>typeof n==='string'&&n.trim().length>0&&n.trim().length<=24;
const idValid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(s);
const now=()=>Math.floor(Date.now()/1000);
function json(x,status=200,origin){
 const h={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','vary':'Origin'};
 if(origin&&ORIGINS.has(origin))h['access-control-allow-origin']=origin;
 return new Response(JSON.stringify(x),{status,headers:h});
}
function problem(code,message,status=400,origin){return json({error:{code,message}},status,origin)}
function options(origin){
 const h={'cache-control':'no-store','vary':'Origin','access-control-allow-methods':'GET,POST,PATCH,DELETE,PUT,OPTIONS','access-control-allow-headers':'authorization,content-type,idempotency-key','access-control-max-age':'300'};
 if(origin&&ORIGINS.has(origin))h['access-control-allow-origin']=origin;
 return new Response(null,{status:204,headers:h});
}
async function body(req){
 const length=Number(req.headers.get('content-length')||0);
 if(length>8192)throw Error('request_too_large');
 return await req.json();
}
function owner(env,userId){
 if(typeof env.CLOCK_OWNER_USER_IDS!=='string'||!env.CLOCK_OWNER_USER_IDS.trim())return false;
 return env.CLOCK_OWNER_USER_IDS.split(',').map(s=>s.trim()).filter(Boolean).includes(userId);
}
// Starry ID remains the authority for the Owner role. The Clock allowlist alone
// must not retain pricing privileges after Starry ID revokes an Owner.
async function requireCentralOwner(bearer,origin){
 try{
  const member=await new Starry({
   baseUrl:'https://id.starry.phd',
   fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(8000)})
  }).me(bearer.slice(7));
  if(member?.staff_role!=='owner')return problem('FORBIDDEN','中央會員權限不足，無法修改費率',403,origin);
  return null;
 }catch{
  return problem('OWNER_VERIFICATION_UNAVAILABLE','暫時無法確認管理員權限，請稍後再試',503,origin);
 }
}
async function dbOne(env,sql,...args){return env.DB.prepare(sql).bind(...args).first()}
async function dbAll(env,sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results||[]}
async function dbRun(env,sql,...args){return env.DB.prepare(sql).bind(...args).run()}
async function price(env,feature=TASK){
 return await dbOne(env,'SELECT feature,label,units,enabled,version,changed_at FROM clock_pricing WHERE feature=?',feature);
}
function enabledFor(price,env){
 return Boolean(price?.enabled&&(!price.units||(env.BATTERY_CHARGES_ENABLED==='true'&&!!env.STARRY_BATTERY_KEY)));
}
function safePrice(row,env){
 return {feature:row.feature,label:row.label,units:row.units,enabled:Boolean(row.enabled),available:enabledFor(row,env),version:row.version};
}
async function battery(endpoint,payload,memberToken,env){
 // Official Starry backend SDK is the only central Battery HTTP client.
 // Task IDs and monetary units remain Clock-owned; no central D1 writes.
 const client=new Starry({
  baseUrl:'https://id.starry.phd',
  serviceKey:env.STARRY_BATTERY_KEY,
  fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})
 });
 try{
  if(endpoint==='/v1/battery/reservations'){
   return await client.reserve(memberToken,{
    taskType:payload.task_type,taskLabel:payload.task_label,units:payload.units,
    idempotencyKey:payload.idempotency_key
   });
  }
  const id=/^\/v1\/battery\/reservations\/([^/]+)\/(commit|release)$/.exec(endpoint);
  if(!id)throw Error('invalid_battery_endpoint');
  return id[2]==='commit'
   ?await client.commit(decodeURIComponent(id[1]),payload?.units)
   :await client.release(decodeURIComponent(id[1]));
 }catch(error){
  if(error instanceof StarryError){
   const e=Error('central_battery_failed');
   e.code=error.code||'CENTRAL_UNAVAILABLE';
   e.httpStatus=error.status;
   throw e;
  }
  throw error;
 }
}
async function releaseQuiet(resId,env){
 if(!resId)return;
 try{await battery('/v1/battery/reservations/'+encodeURIComponent(resId)+'/release',undefined,null,env)}catch{}
}
async function failed(env,userId,requestId,code){
 await dbRun(env,'UPDATE clock_requests SET state=?,error_code=?,updated_at=? WHERE user_id=? AND request_id=?','failed',code,now(),userId,requestId);
 await dbRun(env,"DELETE FROM clock_presets WHERE user_id=? AND request_id=? AND state='pending'",userId,requestId);
}
async function settle(env,member,record,origin){
 const resId=record.reservation_id,requestId=record.request_id;
 if(!resId)return problem('REQUEST_PENDING','新增請求仍在處理，請稍後重新整理',409,origin);
 try {
  const result=await battery('/v1/battery/reservations/'+encodeURIComponent(resId)+'/commit',{units:record.charge_units},null,env);
  if(result.status!=='committed'||result.charged!==record.charge_units)throw Error('settlement_incomplete');
 }catch{
  // Do not release ambiguous commits: central commit may have succeeded.
  // Retrying this exact request_id can safely re-commit the same reservation.
  return problem('SETTLEMENT_PENDING','扣量確認中；請勿重複新建，稍後用相同請求再試',503,origin);
 }
 await dbRun(env,"UPDATE clock_presets SET state='active',paid_units=?,updated_at=? WHERE user_id=? AND request_id=? AND state='pending'",record.charge_units,now(),member,requestId);
 await dbRun(env,"UPDATE clock_requests SET state='committed',updated_at=? WHERE user_id=? AND request_id=?",now(),member,requestId);
 const p=await dbOne(env,"SELECT preset_id,name,duration_seconds,paid_units FROM clock_presets WHERE user_id=? AND request_id=? AND state='active'",member,requestId);
 return json({status:'created',preset:p,charged_units:record.charge_units,replayed:false},201,origin);
}
export async function handleClock(request,env,verify){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 const origin=request.headers.get('origin');
 if(origin&&!ORIGINS.has(origin))return problem('ORIGIN_REJECTED','來源網域未授權',403);
 if(method==='OPTIONS')return options(origin);
 if(path==='/health')return json({status:'ok',service:'clock-api',app_id:'clock',battery_definition:'會員共用的消費用量月額度',charging_enabled:env.BATTERY_CHARGES_ENABLED==='true'&&!!env.STARRY_BATTERY_KEY},200,origin);
 if(!env.DB)return problem('DB_UNAVAILABLE','Clock 資料庫尚未設定',503,origin);
 try{
  if(path==='/v1/pricing'&&method==='GET'){
   const rows=await dbAll(env,'SELECT feature,label,units,enabled,version,changed_at FROM clock_pricing ORDER BY feature');
   return json({free_presets:3,max_presets:50,battery_name:'繁星電池艙 Starry Battery',battery_definition:'會員共用的消費用量月額度',features:rows.map(x=>safePrice(x,env))},200,origin);
  }
  const auth=request.headers.get('authorization')||'';
  if(!auth.startsWith('Bearer ')||auth.length>16394)return problem('UNAUTHORIZED','請先登入 Starry ID',401,origin);
  let claims;
  try{claims=await verify(auth.slice(7))}catch{return problem('UNAUTHORIZED','Starry ID 登入已失效或暫時無法驗證',401,origin)}
  const userId=claims.sub;
  if(!userId||claims.app_id!=='clock')return problem('UNAUTHORIZED','登入帳號與 Clock 不符',401,origin);

  // First three slots belong to the Starry member, not to the current device.
  // Local v1 presets are imported only once; other devices read the first
  // authenticated bootstrap instead of silently overwriting the cloud.
  const freeRows=()=>dbAll(env,
   'SELECT slot,preset_id AS id,name,duration_seconds AS durationSeconds,version FROM clock_free_presets WHERE user_id=? ORDER BY slot',userId);
  const freeValid=p=>p&&typeof p==='object'&&typeof p.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(p.id)&&timerName(p.name)&&
    Number.isInteger(p.durationSeconds)&&p.durationSeconds>=1&&p.durationSeconds<=86399;
  if(path==='/v1/presets/free'&&method==='GET'){
    return json({presets:await freeRows()},200,origin);
  }
  if(path==='/v1/presets/free/init'&&method==='POST'){
    const input=await body(request);
    if(!Array.isArray(input.presets)||input.presets.length<1||input.presets.length>3||
       input.presets.some(p=>!freeValid(p))||
       new Set(input.presets.map(p=>p.id)).size!==input.presets.length)
      return problem('INVALID_FREE_PRESETS','首次同步僅接受 1～3 組有效用途',400,origin);
    // A preset ID must never appear in both the free and paid lists.
    const paid=await dbAll(env,"SELECT preset_id AS id FROM clock_presets WHERE user_id=? AND state IN ('pending','active')",userId);
    if(input.presets.some(p=>paid.some(x=>x.id===p.id)))return problem('PRESET_ID_CONFLICT','此用途已存在於付費清單，請重新同步',409,origin);
    // First write wins. Subsequent devices never change canonical free slots.
    const existing=await freeRows();
    if(existing.length===0){
      // One atomic SQL statement prevents two simultaneous device bootstraps
      // from interleaving the first three slots.
      const values=input.presets.map(() => '(?,?,?,?,?)').join(',');
      const params=input.presets.flatMap((p,slot)=>[userId,slot,p.id,p.name.trim(),p.durationSeconds]);
      await dbRun(env,
       'INSERT OR IGNORE INTO clock_free_presets(user_id,slot,preset_id,name,duration_seconds) VALUES '+values,
       ...params);
    }
    return json({presets:await freeRows()},200,origin);
  }
  if(path==='/v1/presets/free'&&method==='POST'){
    const input=await body(request);
    if(!freeValid(input))return problem('INVALID_FREE_PRESET','免費用途資料不正確',400,origin);
    const current=await freeRows();
    if(current.some(p=>p.id===input.id))return problem('FREE_PRESET_EXISTS','此用途已存在於雲端',409,origin);
    const used=await dbOne(env,"SELECT preset_id FROM clock_presets WHERE user_id=? AND preset_id=? AND state IN ('pending','active')",userId,input.id);
    if(used)return problem('PRESET_ID_CONFLICT','此用途已存在於付費清單',409,origin);
    if(current.length>=3)return problem('FREE_SLOTS_FULL','免費用途最多三組',409,origin);
    // A single conditional INSERT prevents concurrent requests from using a
    // fourth free slot; slots 0–2 are the only possible targets.
    const inserted=await dbRun(env,
      `INSERT OR IGNORE INTO clock_free_presets(user_id,slot,preset_id,name,duration_seconds)
       SELECT ?,s.slot,?,?,? FROM (SELECT 0 AS slot UNION ALL SELECT 1 UNION ALL SELECT 2) s
       WHERE NOT EXISTS(SELECT 1 FROM clock_free_presets f WHERE f.user_id=? AND f.slot=s.slot)
       ORDER BY s.slot LIMIT 1`,
      userId,input.id,input.name.trim(),input.durationSeconds,userId);
    if((inserted.meta?.changes||0)!==1)return problem('FREE_SLOT_CONFLICT','其他裝置已更新免費用途，請重新整理',409,origin);
    const updated=await freeRows();
    return json({status:'created',presets:updated},201,origin);
  }
  const freeMatch=/^\/v1\/presets\/free\/([A-Za-z0-9_-]{1,80})$/.exec(path);
  if(freeMatch&&method==='PATCH'){
    const input=await body(request);
    if(!timerName(input.name)||!Number.isInteger(input.duration_seconds)||input.duration_seconds<1||
       input.duration_seconds>86399||!Number.isInteger(input.version)||input.version<1)
       return problem('INVALID_FREE_PRESET','免費用途版本、名稱或長度不正確',400,origin);
    const updated=await dbRun(env,
     'UPDATE clock_free_presets SET name=?,duration_seconds=?,version=version+1,updated_at=? WHERE user_id=? AND preset_id=? AND version=?',
     input.name.trim(),input.duration_seconds,now(),userId,freeMatch[1],input.version);
    if((updated.meta?.changes||0)!==1)return problem('FREE_SLOT_CONFLICT','其他裝置已修改此用途，請重新整理',409,origin);
    return json({status:'updated',presets:await freeRows()},200,origin);
  }
  if(freeMatch&&method==='DELETE'){
    const input=await body(request);
    if(!Number.isInteger(input?.version)||input.version<1)return problem('INVALID_FREE_PRESET','請提供目前用途版本',400,origin);
    const result=await dbRun(env,
     'DELETE FROM clock_free_presets WHERE user_id=? AND preset_id=? AND version=?',
     userId,freeMatch[1],input.version);
    if((result.meta?.changes||0)!==1)return problem('FREE_SLOT_CONFLICT','其他裝置已修改此用途，請重新整理',409,origin);
    return json({status:'deleted',presets:await freeRows(),refunded_units:0},200,origin);
  }
  if(path==='/v1/presets'&&method==='GET'){
    const presets=await dbAll(env,"SELECT preset_id AS id,name,duration_seconds AS durationSeconds,paid_units AS paidUnits FROM clock_presets WHERE user_id=? AND state='active' ORDER BY created_at",userId);
    return json({presets},200,origin);
  }
  if(path==='/v1/admin/pricing'&&method==='GET'){
    if(!owner(env,userId))return problem('FORBIDDEN','僅限 Clock Owner',403,origin);
    const rows=await dbAll(env,'SELECT feature,label,units,enabled,version,changed_at FROM clock_pricing ORDER BY feature');
    return json({owner:true,features:rows.map(x=>safePrice(x,env))},200,origin);
  }
  if(path==='/v1/admin/pricing'&&method==='PUT'){
    if(!owner(env,userId))return problem('FORBIDDEN','僅限 Clock Owner',403,origin);
    const notOwner=await requireCentralOwner(auth,origin);
    if(notOwner)return notOwner;
    const input=await body(request);
    if(typeof input.feature!=='string'||!Number.isInteger(input.units)||input.units<0||input.units>LIMIT||typeof input.enabled!=='boolean'||!Number.isInteger(input.version))return problem('INVALID_PRICE','價格必須是 0～30 顆的整數，並提供版本與開關',400,origin);
    const old=await price(env,input.feature);
    if(!old)return problem('UNKNOWN_FEATURE','此功能尚未列入 Clock 定價',404,origin);
    const changed=await dbRun(env,'UPDATE clock_pricing SET units=?,enabled=?,version=version+1,changed_by=?,changed_at=? WHERE feature=? AND version=?',input.units,input.enabled?1:0,userId,now(),input.feature,input.version);
    if((changed.meta?.changes||0)!==1)return problem('PRICE_CONFLICT','費率已被更新，請重新載入',409,origin);
    await dbRun(env,'INSERT INTO clock_pricing_audit(feature,old_units,new_units,old_enabled,new_enabled,actor_user_id) VALUES(?,?,?,?,?,?)',input.feature,old.units,input.units,old.enabled,input.enabled?1:0,userId);
    const updated=await price(env,input.feature);
    return json({status:'saved',price:safePrice(updated,env)},200,origin);
  }
  const match=/^\/v1\/presets\/([A-Za-z0-9_-]{8,80})$/.exec(path);
  if(match&&method==='DELETE'){
    const result=await dbRun(env,"UPDATE clock_presets SET state='deleted',updated_at=? WHERE user_id=? AND preset_id=? AND state='active'",now(),userId,match[1]);
    return (result.meta?.changes||0)?json({status:'deleted',refunded_units:0},200,origin):problem('NOT_FOUND','找不到可刪除的雲端計時器',404,origin);
  }
  if(match&&method==='PATCH'){
    const input=await body(request);
    if(!timerName(input.name)||!Number.isInteger(input.duration_seconds)||input.duration_seconds<1||input.duration_seconds>86399)return problem('INVALID_PRESET','請填寫名稱及有效倒數秒數',400,origin);
    const result=await dbRun(env,"UPDATE clock_presets SET name=?,duration_seconds=?,updated_at=? WHERE user_id=? AND preset_id=? AND state='active'",input.name.trim(),input.duration_seconds,now(),userId,match[1]);
    return (result.meta?.changes||0)?json({status:'updated'},200,origin):problem('NOT_FOUND','找不到可修改的雲端計時器',404,origin);
  }
  if(path==='/v1/presets'&&method==='POST'){
    const input=await body(request);
    const {preset_id,request_id,name,duration_seconds,accepted_units}=input;
    if(!idValid(preset_id)||!idValid(request_id)||!timerName(name)||!Number.isInteger(duration_seconds)||duration_seconds<1||duration_seconds>86399||!Number.isInteger(accepted_units))return problem('INVALID_PRESET','計時器資料或請求編號不正確',400,origin);
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode([preset_id,name.trim(),duration_seconds,accepted_units].join('|'))))).map(b=>b.toString(16).padStart(2,'0')).join('');
    // A completed request is recoverable even if Owner changes X or disables
    // charging afterward. Never reserve or commit new usage while the kill switch is off.
    const prior=await dbOne(env,'SELECT * FROM clock_requests WHERE user_id=? AND request_id=?',userId,request_id);
    if(prior){
      if(prior.payload_hash!==fingerprint)return problem('IDEMPOTENCY_CONFLICT','請求編號不可用於不同計時器',409,origin);
      if(prior.state==='committed'){
        const recorded=await dbOne(env,"SELECT preset_id AS id,name,duration_seconds AS durationSeconds,paid_units AS paidUnits FROM clock_presets WHERE user_id=? AND request_id=?",userId,request_id);
        return json({status:'created',preset:recorded,charged_units:prior.charge_units,replayed:true},200,origin);
      }
      if(prior.state==='failed')return problem('PREVIOUS_REQUEST_FAILED','先前新增失敗，請重新確認後再試',409,origin);
      if(!prior.reservation_id)return problem('REQUEST_PENDING','新增處理中，請勿重複送出',409,origin);
      if(env.BATTERY_CHARGES_ENABLED!=='true'||!env.STARRY_BATTERY_KEY)return problem('BATTERY_NOT_READY','電池扣量暫停，原請求尚未完成',503,origin);
      return settle(env,userId,prior,origin);
    }
    // A new paid fourth timer requires three member-owned free slots.
    // Replay of a previously committed or reserved transaction was handled
    // above, so this guard cannot retroactively duplicate a charge.
    const memberFree=await freeRows();
    if(memberFree.length<3)return problem('FREE_SLOTS_NOT_READY','請先登入並同步前三組免費計時器，之後才能確認第 4 組扣量',409,origin);
    if(memberFree.some(p=>p.id===preset_id))return problem('PRESET_ID_CONFLICT','計時器編號已存在於免費用途中',409,origin);
    const p=await price(env);
    if(!p||!p.enabled)return problem('FEATURE_DISABLED','付費新增尚未開放，原有計時器仍可正常使用',409,origin);
    if(accepted_units!==p.units)return problem('PRICE_CHANGED','費率已更新，請重新確認',409,origin);
    if(!enabledFor(p,env))return problem('BATTERY_NOT_READY','中央 Battery 扣量服務尚未啟用',503,origin);
    const reqCreate=await dbRun(env,"INSERT OR IGNORE INTO clock_requests(user_id,request_id,preset_id,payload_hash,state,charge_units) VALUES(?,?,?,?,?,?)",userId,request_id,preset_id,fingerprint,'pending',p.units);
    const existing=await dbOne(env,'SELECT * FROM clock_requests WHERE user_id=? AND request_id=?',userId,request_id);
    if(existing?.payload_hash!==fingerprint)return problem('IDEMPOTENCY_CONFLICT','請求編號不可用於不同計時器',409,origin);
    if((reqCreate.meta?.changes||0)===0){
      if(existing.state==='committed'){
        const recorded=await dbOne(env,"SELECT preset_id AS id,name,duration_seconds AS durationSeconds,paid_units AS paidUnits FROM clock_presets WHERE user_id=? AND request_id=?",userId,request_id);
        return json({status:'created',preset:recorded,charged_units:existing.charge_units,replayed:true},200,origin);
      }
      if(existing.state==='failed')return problem('PREVIOUS_REQUEST_FAILED','先前新增失敗，請重新確認後再試',409,origin);
      if(existing.reservation_id)return settle(env,userId,existing,origin);
      return problem('REQUEST_PENDING','新增處理中，請勿重複送出',409,origin);
    }
    const inserted=await dbRun(env,"INSERT OR IGNORE INTO clock_presets(user_id,preset_id,name,duration_seconds,state,request_id) SELECT ?,?,?,?,'pending',? WHERE (SELECT COUNT(*) FROM clock_presets WHERE user_id=? AND state IN ('pending','active'))<?",userId,preset_id,name.trim(),duration_seconds,request_id,userId,MAX_EXTRAS);
    if((inserted.meta?.changes||0)!==1){await failed(env,userId,request_id,'PRESET_EXISTS_OR_LIMIT');return problem('PRESET_EXISTS_OR_LIMIT','計時器已存在或已滿 50 組',409,origin);}
    if(p.units===0){
      await dbRun(env,"UPDATE clock_presets SET state='active' WHERE user_id=? AND request_id=?",userId,request_id);
      await dbRun(env,"UPDATE clock_requests SET state='committed' WHERE user_id=? AND request_id=?",userId,request_id);
      return json({status:'created',charged_units:0,preset:{id:preset_id,name:name.trim(),durationSeconds:duration_seconds}},201,origin);
    }
    let reservation;
    try{
      reservation=await battery('/v1/battery/reservations',{task_type:TASK,task_label:p.label.slice(0,40),units:p.units,idempotency_key:'clock:'+request_id},auth.slice(7),env);
    }catch(error){
      await failed(env,userId,request_id,error.code||'BATTERY_UNAVAILABLE');
      if(error.code==='BATTERY_INSUFFICIENT')return problem('BATTERY_INSUFFICIENT','免費月額度與此 App 量子電池不足，請稍後再試或等待下月恢復',409,origin);
      if(error.code==='BATTERY_APP_CAP')return problem('BATTERY_APP_CAP','Clock 電池用量已達本月上限，請稍後再試',409,origin);
      if(error.code==='SERVICE_UNAVAILABLE')return problem('SERVICE_UNAVAILABLE','中央電池艙維護中，請稍後再試；本次不會扣量',503,origin);
      if(error.code==='IDEMPOTENCY_CONFLICT')return problem('IDEMPOTENCY_CONFLICT','中央任務編號已被其他請求使用',409,origin);
      return problem('BATTERY_UNAVAILABLE','電池艙暫時無法扣量，未新增計時器',503,origin);
    }
    if(!reservation?.reservation_id||reservation.task_type!==TASK||reservation.status!=='reserved'||reservation.units!==p.units||reservation.amount!==p.units){
      await releaseQuiet(reservation?.reservation_id,env);
      await failed(env,userId,request_id,'BATTERY_PRICE_MISMATCH');
      return problem('BATTERY_PRICE_MISMATCH','中央與 Clock 定價不同，本次未扣量',409,origin);
    }
    try{
      await dbRun(env,'UPDATE clock_requests SET reservation_id=?,updated_at=? WHERE user_id=? AND request_id=?',reservation.reservation_id,now(),userId,request_id);
    }catch{
      await releaseQuiet(reservation.reservation_id,env);
      return problem('REQUEST_PENDING','預留資料尚未保存，請勿再次建立',503,origin);
    }
    const record=await dbOne(env,'SELECT * FROM clock_requests WHERE user_id=? AND request_id=?',userId,request_id);
    return settle(env,userId,record,origin);
  }
  return problem('NOT_FOUND','此功能不存在',404,origin);
 }catch(error){
  if(error.message==='request_too_large')return problem('INVALID_REQUEST','請求資料過大',413,origin);
  if(error instanceof SyntaxError)return problem('INVALID_JSON','請提供 JSON 資料',400,origin);
  // Do not reveal SQL, Starry secrets, member tokens or internal stack traces.
  return problem('TEMPORARILY_UNAVAILABLE','Clock 服務暫時無法處理，請稍後重試',503,origin);
 }
}
