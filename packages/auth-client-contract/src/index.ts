/** Read-only Starry ID contract. No change to starry-phd/id or its databases. */
export const STARRY_API = 'https://id.starry.phd' as const;
export const CLOCK_APP_ID = 'clock' as const;
export type AppConfig = {app_id:string;status:'active'|'paused'|'killed';min_version:string;config:Record<string,unknown>};
export type AppConfigState = {kind:'active';value:AppConfig}|{kind:'pending_registration'|'unreachable'|'disabled';message:string};
export async function readAppConfig(base = STARRY_API):Promise<AppConfigState>{
  try {
    const res = await fetch(`${base}/v1/apps/${CLOCK_APP_ID}/config`, {headers:{Accept:'application/json'}});
    if(res.status===404)return {kind:'pending_registration',message:'clock 尚未加入中央 App Registry'};
    if(!res.ok)return {kind:'unreachable',message:`Central API HTTP ${res.status}`};
    const value=await res.json() as AppConfig;
    if(value.app_id!==CLOCK_APP_ID||value.status!=='active') return {kind:'disabled',message:'中央會員尚未啟用 clock'};
    return {kind:'active',value};
  }catch{return {kind:'unreachable',message:'中央會員暫時無法連線'};}
}
/** Called only after a real, verified OAuth flow has returned a per-app token. */
export async function readMe(accessToken:string, base = STARRY_API):Promise<{user_id:string;profile?:{display_name?:string|null}}> {
  if(!accessToken)throw new Error('No access token');
  const res=await fetch(`${base}/v1/me`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}});
  if(!res.ok)throw new Error(`Starry ID: ${res.status}`);
  return await res.json() as {user_id:string;profile?:{display_name?:string|null}};
}
