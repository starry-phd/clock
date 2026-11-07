/**
 * Starry ID shared session.
 * The official StarryClient owns refresh-token rotation and relay authentication;
 * legacy SecureStore/sessionStorage keys are mapped to avoid signing members out.
 * No service key or access token is saved in application data.
 */
import {Platform} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import {
  StarryClient, StarryError, parseRelayResult,
  type StarryStorage
} from './starry-client';
import {
  buildRelayUrl, parseRelayCallback, RELAY_NATIVE_RETURN,
  createNonce, linkIdentity, StarryApiError, STARRY_API
} from '@clock/auth-contract';
import type {RelayProvider, StarryMe} from '@clock/auth-contract';
import appJson from '../../app.json';

const REFRESH='clock:starry:refresh:v1';
const LINK_PENDING='clock:starry:link:v2';
const legacyAccess='clock:starry:access:v1';

function compatKey(key:string):string{
  if(key==='starry.refresh.clock')return REFRESH;
  if(key==='starry.relay.clock')return 'clock:starry:sdk-relay:v2';
  return key;
}
function browserStorage():Storage{
  if(typeof window==='undefined')throw new Error('Browser session unavailable');
  return window.sessionStorage;
}
const storage:StarryStorage={
 get(key){
   const mapped=compatKey(key);
   return Platform.OS==='web'?browserStorage().getItem(mapped):SecureStore.getItemAsync(mapped);
 },
 set(key,value){
   const mapped=compatKey(key);
   return Platform.OS==='web'?browserStorage().setItem(mapped,value):SecureStore.setItemAsync(mapped,value);
 },
 remove(key){
   const mapped=compatKey(key);
   return Platform.OS==='web'?browserStorage().removeItem(mapped):SecureStore.deleteItemAsync(mapped);
 }
};
const starry=new StarryClient({
 baseUrl:STARRY_API,
 appId:'clock',
 storage,
 sha256Hex:text=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,text),
 randomState:()=>Array.from(Crypto.getRandomBytes(32)).map(n=>n.toString(16).padStart(2,'0')).join(''),
 openAuthSession:async(url,returnUrl)=>{
   const result=await WebBrowser.openAuthSessionAsync(url,returnUrl);
   return result.type==='success'?result.url:null;
 }
});

export function officialStarryClient(){return starry;}

export async function clearSession():Promise<void>{
  // SDK signOut clears local tokens even if the central endpoint fails.
  await starry.signOut();
  if(Platform.OS==='web'){
    browserStorage().removeItem(LINK_PENDING);
  }else{
    // An older client saved access tokens on disk. SDK uses memory only.
    await SecureStore.deleteItemAsync(legacyAccess).catch(()=>{});
  }
}

export async function requestAccess():Promise<string>{
  const token=await starry.getAccessToken();
  if(!token)throw new StarryError(401,'NOT_SIGNED_IN','請先登入 Starry ID');
  return token;
}
export async function withAccess<T>(fn:(accessToken:string)=>Promise<T>):Promise<T>{
  const token=await requestAccess();
  try{return await fn(token);}
  catch(error){
    const unauth=(error instanceof StarryApiError||error instanceof StarryError)&&error.status===401;
    if(!unauth)throw error;
    const renewed=await starry.refresh();
    if(!renewed)throw error;
    return fn(renewed);
  }
}
export async function loadMember():Promise<StarryMe|null>{
  try{
    if(!(await starry.restore()))return null;
    return (await starry.me()) as unknown as StarryMe;
  }catch{return null;}
}
function hex(bytes:Uint8Array){
  return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function startStarryRelay(provider:RelayProvider,mode:'login'|'link'='login'):Promise<void>{
 const gate=await starry.checkApp(appJson.expo.version);
 if(gate.state!=='ok')throw new Error(gate.state==='unreachable'?'中央會員暫時無法連線':'Clock 暫時維護或需更新');
 if(mode==='login'){
   if(Platform.OS==='web'){
     await starry.beginRelayRedirect(provider,{returnUrl:'https://clock.starry.phd/auth/done'});
   }else{
     try{await starry.signInWithRelay(provider,{returnUrl:RELAY_NATIVE_RETURN[provider]});}
     catch(error){if(error instanceof StarryError&&error.cancelled)return;throw error;}
   }
   return;
 }
 // Linking a second provider is different from signing in again. Preserve the
 // existing safe link endpoint, but use the SDK session for authorization.
 const nonce=await createNonce();
 const state=hex(Crypto.getRandomBytes(32));
 const hash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,nonce);
 const url=buildRelayUrl(provider,hash,state,Platform.OS==='web'?'web':'native');
 if(Platform.OS==='web'){
   browserStorage().setItem(LINK_PENDING,JSON.stringify({nonce,state,provider,createdAt:Date.now()}));
   window.location.assign(url);
   return;
 }
 const outcome=await WebBrowser.openAuthSessionAsync(url,RELAY_NATIVE_RETURN[provider]);
 if(outcome.type!=='success')return;
 const parsed=parseRelayCallback(outcome.url,provider,'native',state);
 if(!parsed.ok)return;
 await withAccess(token=>linkIdentity(token,provider,parsed.idToken,nonce,parsed.authorizationCode));
}
export async function finishWebRelay():Promise<{ok:boolean;message:string}>{
 if(Platform.OS!=='web'||typeof window==='undefined')return {ok:false,message:'not_web'};
 const raw=browserStorage().getItem(LINK_PENDING);
 if(raw){
   browserStorage().removeItem(LINK_PENDING);
   const callback=window.location.href;
   window.history.replaceState(null,'',window.location.pathname+window.location.search);
   try{
     const pending=JSON.parse(raw) as {nonce:string;state:string;provider:RelayProvider;createdAt:number};
     if(Date.now()-pending.createdAt>10*60*1000)throw Error('登入已逾時');
     const parsed=parseRelayResult(callback);
     if(!parsed?.idToken||parsed.state!==pending.state)throw Error('登入狀態無法驗證');
     await withAccess(token=>linkIdentity(token,pending.provider,parsed.idToken!,pending.nonce,parsed.code||undefined));
     return {ok:true,message:'登入方式已綁定'};
   }catch{return {ok:false,message:'登入驗證失敗，請重新操作'};}
 }
 try{
   const result=await starry.completeRelayRedirect();
   return result?{ok:true,message:'登入成功'}:{ok:false,message:'無登入資訊'};
 }catch(error){
   if(error instanceof StarryError&&error.cancelled)return {ok:false,message:'登入已取消'};
   return {ok:false,message:'登入驗證失敗，請重新操作'};
 }
}
export async function signOut():Promise<void>{
 await clearSession();
}
export async function signOutEverywhere():Promise<void>{
 await starry.signOutEverywhere();
 if(Platform.OS!=='web')await SecureStore.deleteItemAsync(legacyAccess).catch(()=>{});
}
