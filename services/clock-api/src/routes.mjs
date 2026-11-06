/**
 * Clock's independent authenticated API. D1 stores Clock data only.
 * Starry Battery is the member's shared monthly CONSUMPTION quota, AI + non-AI.
 * All usage is reserved/committed server-side; no sensitive keys in clients.
 */
const ORIGINS=new Set(['https://clock.starry.phd','https://clock-staging.starry-phd.workers.dev']);
const MAX_EXTRAS=47;
const TASK='clock.preset.create';
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
async function battery(endpoint,body,memberToken,env){
 const headers={'accept':'application/json','x-starry-app-key':env.STARRY_BATTERY_KEY};
 if(memberToken)headers.authorization='Bearer '+memberToken;
 if(body!==undefined)headers['content-type']='application/json';
 const response=await fetch('https://id.starry.phd'+endpoint,{
  method:'POST',headers,body:body===undefined?undefined:JSON.stringify(body),
  signal:AbortSignal.timeout(10000)
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok){
  const err=Error('central_battery_failed');err.code=result?.error?.code||'CENTRAL_UNAVAILABLE';err.httpStatus=response.status;
  throw err;
 }
 return result;
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
    const p=await price(env);
    if(!p||!p.enabled)return problem('FEATURE_DISABLED','付費新增尚未開放，原有計時器仍可正常使用',409,origin);
    if(accepted_units!==p.units)return problem('PRICE_CHANGED','費率已更新，請重新確認',409,origin);
    if(!enabledFor(p,env))return problem('BATTERY_NOT_READY','中央 Battery 扣量服務尚未啟用',503,origin);
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode([preset_id,name.trim(),duration_seconds,accepted_units].join('|'))))).map(b=>b.toString(16).padStart(2,'0')).join('');
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
      reservation=await battery('/v1/battery/reservations',{task_type:TASK,units:p.units,idempotency_key:'clock:'+request_id},auth.slice(7),env);
    }catch(error){
      await failed(env,userId,request_id,error.code||'BATTERY_UNAVAILABLE');
      return problem(error.code==='BATTERY_INSUFFICIENT'?'BATTERY_INSUFFICIENT':'BATTERY_UNAVAILABLE',error.code==='BATTERY_INSUFFICIENT'?'本月電池不足，請等待下月恢復':'電池艙暫時無法扣量，未新增計時器',error.code==='BATTERY_INSUFFICIENT'?409:503,origin);
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
