/**
 * Clock's ONLY member API client. Contracts are generated from Starry ID's public
 * OpenAPI 3.1 via openapi-typescript (pnpm codegen:starry); never hand-write DTOs.
 * Do not modify starry-phd/id, its secrets or databases.
 */
import type {components, paths} from './generated/starry-id';
export {APP_ID, STARRY_ID_ORIGIN as STARRY_API} from './relay';
export type {RelayProvider, RelayResult} from './relay';
export {RELAY_NATIVE_RETURN, RELAY_WEB_RETURN, buildRelayUrl, parseRelayCallback} from './relay';
import {APP_ID, STARRY_ID_ORIGIN} from './relay';
import type {RelayProvider} from './relay';

export type AppConfig = components['schemas']['AppConfig'];
export type StarryMe = components['schemas']['Me'];
export type StarryProfile = components['schemas']['Profile'];
export type TokenPair = components['schemas']['TokenPair'];
export type SignInResponse = components['schemas']['SignInResponse'];
export type BatteryActivity = components['schemas']['BatteryActivity'];
export type BatteryReservation = components['schemas']['BatteryReservation'];
export type ProfilePatch = NonNullable<paths['/v1/me/profile']['patch']['requestBody']>['content']['application/json'];
export type AppConfigState =
 | {kind:'active';value:AppConfig}
 | {kind:'pending_registration'|'unreachable'|'disabled'|'update_required';message:string};

export class StarryApiError extends Error {
 constructor(public readonly status:number, public readonly code:string, message:string) { super(message); this.name='StarryApiError'; }
}
async function json<T>(path:string, init:RequestInit={}, token?:string, base:string=STARRY_ID_ORIGIN):Promise<T> {
 const headers = new Headers(init.headers);
 headers.set('Accept','application/json');
 if(init.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
 if(token) headers.set('Authorization','Bearer '+token);
 const response=await fetch(base+path,{...init,headers,credentials:'omit'});
 if(!response.ok){
   const payload=await response.json().catch(()=>null) as {error?:{code?:string;message?:string}}|null;
   throw new StarryApiError(response.status,payload?.error?.code||'HTTP_'+response.status,payload?.error?.message||'Starry ID request failed');
 }
 if(response.status===204) return undefined as T;
 return await response.json() as T;
}
const post=(body:unknown)=>JSON.stringify(body);

export function compareVersions(a:string,b:string):number{
 const av=a.split('.').map(Number),bv=b.split('.').map(Number);
 for(let i=0;i<3;i++){const x=Number.isFinite(av[i])?av[i]:0,y=Number.isFinite(bv[i])?bv[i]:0;if(x!==y)return x<y?-1:1;}
 return 0;
}
export async function readAppConfig(base:string=STARRY_ID_ORIGIN, appVersion='1.1.1'):Promise<AppConfigState>{
 try {
  const value=await json<AppConfig>('/v1/apps/'+APP_ID+'/config',{},undefined,base);
  if(value.app_id!==APP_ID||value.status!=='active') return {kind:'disabled',message:value.status==='paused'?'中央會員維護中':'中央會員目前未啟用'};
  if(compareVersions(appVersion,value.min_version)<0) return {kind:'update_required',message:'需要更新 Clock 才能繼續使用會員功能'};
  return {kind:'active',value};
 }catch(err){
  if(err instanceof StarryApiError && err.status===404)return {kind:'pending_registration',message:'clock 尚未於中央啟用'};
  return {kind:'unreachable',message:'Starry ID 暫時無法連線'};
 }
}
export async function createNonce():Promise<string>{
 const data=await json<paths['/v1/auth/nonce']['post']['responses'][200]['content']['application/json']>(
 '/v1/auth/nonce',{method:'POST',body:post({app_id:APP_ID})});
 if(!data.nonce||data.nonce.length<16||data.nonce.length>128) throw new Error('Invalid Starry nonce');
 return data.nonce;
}
export async function exchangeRelay(provider:RelayProvider,idToken:string,nonce:string,authorizationCode?:string):Promise<SignInResponse>{
 const body:Record<string,unknown>={app_id:APP_ID,id_token:idToken,nonce};
 if(provider==='apple'&&authorizationCode){
  body.authorization_code=authorizationCode;
  body.redirect_uri=STARRY_ID_ORIGIN+'/auth/apple/callback';
 }
 return json<SignInResponse>('/v1/auth/'+provider,{method:'POST',body:post(body)});
}
export async function refreshToken(refresh:string):Promise<TokenPair>{
 return json<TokenPair>('/v1/auth/refresh',{method:'POST',body:post({refresh_token:refresh})});
}
export async function readMe(accessToken:string):Promise<StarryMe>{
 return json<StarryMe>('/v1/me',{},accessToken);
}
export async function updateProfile(accessToken:string, version:number, changes:ProfilePatch):Promise<components['schemas']['ProfileResponse']>{
 return json<components['schemas']['ProfileResponse']>('/v1/me/profile',{
  method:'PATCH',headers:{'If-Match':'"'+version+'"'},body:post(changes)
 },accessToken);
}
export async function setConsent(accessToken:string, termsVersion:string, privacyVersion:string):Promise<void>{
 return json<void>('/v1/me/consents',{method:'POST',body:post({terms_version:termsVersion,privacy_version:privacyVersion})},accessToken);
}
export async function logout(accessToken:string):Promise<void>{
 return json<void>('/v1/auth/logout',{method:'POST'},accessToken);
}
export async function logoutAll(accessToken:string):Promise<void>{
 return json<void>('/v1/auth/logout-all',{method:'POST'},accessToken);
}
export async function deleteAccount(accessToken:string):Promise<{status:string;deletion_purge_at:number}>{
 return json<{status:string;deletion_purge_at:number}>('/v1/me/deletion',{method:'POST',body:post({confirm:true})},accessToken);
}
export async function undoDeletion(accessToken:string):Promise<{status:string}>{
 return json<{status:string}>('/v1/me/deletion',{method:'DELETE'},accessToken);
}
export async function linkIdentity(accessToken:string,provider:RelayProvider,idToken:string,nonce:string,authorizationCode?:string,mergeOther=false):Promise<{provider:string;linked:boolean;merged?:boolean}>{
 const body:Record<string,unknown>={id_token:idToken,nonce};
 if(provider==='apple' && authorizationCode){body.authorization_code=authorizationCode;body.redirect_uri=STARRY_ID_ORIGIN+'/auth/apple/callback';}
 if(mergeOther)body.merge_other_account=true;
 return json<{provider:string;linked:boolean;merged?:boolean}>('/v1/me/identities/'+provider,{method:'POST',body:post(body)},accessToken);
}
export async function readBattery(accessToken:string):Promise<BatteryActivity>{
 return json<BatteryActivity>('/v1/me/battery',{},accessToken);
}
