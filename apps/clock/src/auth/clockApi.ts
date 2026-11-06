import {withAccess} from './session';
export const CLOCK_API='https://clock.starry.phd/api/clock';
export type ClockPrice={feature:string;label:string;units:number;enabled:boolean;available:boolean;version:number};
export type CloudPreset={id:string;name:string;durationSeconds:number;paidUnits?:number};
type BackendError={error?:{code?:string;message?:string}};
async function call<T>(path:string,method='GET',data?:unknown,token?:string):Promise<T>{
 const headers:Record<string,string>={'Accept':'application/json'};
 if(data!==undefined)headers['Content-Type']='application/json';
 if(token)headers['Authorization']='Bearer '+token;
 let response:Response;
 try{
  response=await fetch(CLOCK_API+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
 }catch{
  throw new Error('無法連線到 Clock 電池服務，請檢查網路連線後再試。免費計時不受影響。');
 }
 const body=await response.json() as T&BackendError;
 if(!response.ok)throw new Error(body.error?.message||'Clock 服務暫時不可用');
 return body;
}
export async function loadClockPricing(){
 return call<{free_presets:number;max_presets:number;features:ClockPrice[]}>('/v1/pricing');
}
export async function readCloudPresets(){
 return withAccess(token=>call<{presets:CloudPreset[]}>('/v1/presets','GET',undefined,token));
}
export async function createChargedPreset(x:CloudPreset,requestId:string,acceptedUnits:number){
 return withAccess(token=>call<{status:string;charged_units:number;preset:CloudPreset}>('/v1/presets','POST',{
  preset_id:x.id,request_id:requestId,name:x.name,
  duration_seconds:x.durationSeconds,accepted_units:acceptedUnits
 },token));
}
export async function editCloudPreset(x:CloudPreset){
 return withAccess(token=>call<{status:string}>('/v1/presets/'+encodeURIComponent(x.id),'PATCH',{
  name:x.name,duration_seconds:x.durationSeconds
 },token));
}
export async function removeCloudPreset(id:string){
 return withAccess(token=>call<{status:string;refunded_units:number}>('/v1/presets/'+encodeURIComponent(id),'DELETE',undefined,token));
}
export async function readOwnerPrices(){
 return withAccess(token=>call<{owner:boolean;features:ClockPrice[]}>('/v1/admin/pricing','GET',undefined,token));
}
export async function saveOwnerPrice(price:ClockPrice,units:number,enabled:boolean){
 return withAccess(token=>call<{price:ClockPrice}>('/v1/admin/pricing','PUT',{
  feature:price.feature,units,enabled,version:price.version
 },token));
}
