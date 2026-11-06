/**
 * Starry ID shared session: native iOS/Android uses expo-web-browser + SecureStore;
 * Expo web uses full-page relay and sessionStorage (never localStorage).
 * No AppleAuthentication/GoogleSignin SDK and no Starry service keys in this App.
 */
import {Platform} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import {
  buildRelayUrl, parseRelayCallback, RELAY_NATIVE_RETURN,
  createNonce, exchangeRelay, refreshToken, readAppConfig, readMe,
  StarryApiError, STARRY_API,
} from '@clock/auth-contract';
import type {RelayProvider, TokenPair, StarryMe, SignInResponse} from '@clock/auth-contract';

const ACCESS='clock:starry:access:v1';
const REFRESH='clock:starry:refresh:v1';
const PENDING='clock:starry:pending:v1';
let accessMemory:string|null=null;
let refreshPromise:Promise<TokenPair>|null=null;

function hex(bytes:Uint8Array):string {
  return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function webStore():Storage {
  if(typeof window==='undefined') throw new Error('Browser session unavailable');
  return window.sessionStorage;
}
async function saveTokens(tokens:TokenPair):Promise<void> {
  if(Platform.OS==='web'){
    accessMemory=tokens.access_token;
    webStore().setItem(REFRESH,tokens.refresh_token);
  }else{
    await SecureStore.setItemAsync(REFRESH,tokens.refresh_token);
    await SecureStore.setItemAsync(ACCESS,tokens.access_token);
    accessMemory=tokens.access_token;
  }
}
export async function clearSession():Promise<void>{
  accessMemory=null;
  if(Platform.OS==='web'){
    if(typeof window!=='undefined'){webStore().removeItem(REFRESH);webStore().removeItem(PENDING);}
  }else{
    await Promise.all([SecureStore.deleteItemAsync(ACCESS),SecureStore.deleteItemAsync(REFRESH)]);
  }
}
async function storedRefresh():Promise<string|null>{
  return Platform.OS==='web' ? (typeof window==='undefined'?null:webStore().getItem(REFRESH)) : SecureStore.getItemAsync(REFRESH);
}
async function storedAccess():Promise<string|null>{
  if(accessMemory)return accessMemory;
  if(Platform.OS==='web')return null; // never persist web access token
  accessMemory=await SecureStore.getItemAsync(ACCESS);
  return accessMemory;
}
async function rotateToken():Promise<TokenPair>{
  if(!refreshPromise){
    refreshPromise=(async()=>{
      const token=await storedRefresh();
      if(!token)throw new Error('Please sign in');
      const rotated=await refreshToken(token);
      // The old refresh token must be replaced atomically before additional API calls.
      await saveTokens(rotated);
      return rotated;
    })().catch(async error=>{
      if(error instanceof StarryApiError && (error.code==='REFRESH_REUSED'||error.status===401)) await clearSession();
      throw error;
    }).finally(()=>{refreshPromise=null;});
  }
  return refreshPromise;
}
export async function requestAccess():Promise<string>{
  const current=await storedAccess();
  if(current)return current;
  const fresh=await rotateToken();
  return fresh.access_token;
}
export async function withAccess<T>(fn:(accessToken:string)=>Promise<T>):Promise<T>{
  let token=await requestAccess();
  try{return await fn(token);}
  catch(error){
    if(!(error instanceof StarryApiError) || error.status!==401)throw error;
    token=(await rotateToken()).access_token;
    return await fn(token);
  }
}
export async function loadMember():Promise<StarryMe|null>{
  const access=await storedAccess(),refresh=await storedRefresh();
  if(!access && !refresh)return null;
  try{return await withAccess(readMe);}
  catch(error){if(error instanceof StarryApiError&&error.status===401)await clearSession();return null;}
}
export async function startStarryRelay(provider:RelayProvider,mode:'login'|'link'='login'):Promise<SignInResponse|undefined>{
  const config=await readAppConfig(STARRY_API);
  if(config.kind!=='active')throw new Error(config.message);
  const nonce=await createNonce();
  const state=hex(Crypto.getRandomBytes(32));
  const hash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,nonce);
  const platform=Platform.OS==='web'?'web':'native';
  const url=buildRelayUrl(provider,hash,state,platform);
  if(platform==='web'){
    webStore().setItem(PENDING,JSON.stringify({state,nonce,provider,mode,createdAt:Date.now()}));
    window.location.assign(url); // full page, no popup, no third-party sign-in SDK
    return;
  }
  const result=await WebBrowser.openAuthSessionAsync(url,RELAY_NATIVE_RETURN[provider]);
  if(result.type!=='success')return;
  const parsed=parseRelayCallback(result.url,provider,'native',state);
  if(!parsed.ok)throw new Error('Login cancelled');
  if(mode==='link'){
    await withAccess(token=>import('@clock/auth-contract').then(m=>
      m.linkIdentity(token,provider,parsed.idToken,nonce,parsed.authorizationCode)));
    return;
  }
  const signed=await exchangeRelay(provider,parsed.idToken,nonce,parsed.authorizationCode);
  await saveTokens(signed);
  return signed;
}
/** Call once on the Expo web /auth/done route, after the full-page relay. */
export async function finishWebRelay():Promise<{ok:boolean;message:string}> {
  if(Platform.OS!=='web'||typeof window==='undefined')return {ok:false,message:'not_web'};
  const callback=window.location.href;
  const hash=window.location.hash;
  // Remove id_token/code from browser URL immediately, before network requests.
  if(hash)window.history.replaceState(null,'',window.location.pathname+window.location.search);
  const raw=webStore().getItem(PENDING);
  webStore().removeItem(PENDING); // one-time anti-replay
  if(!raw)return {ok:false,message:'登入流程已失效，請重新操作。'};
  let p:{state:string;nonce:string;provider:RelayProvider;mode:'login'|'link';createdAt:number};
  try{p=JSON.parse(raw);}catch{return {ok:false,message:'登入驗證狀態錯誤'};}
  if(Date.now()-p.createdAt>10*60*1000)return {ok:false,message:'登入已逾時'};
  try{
    const res=parseRelayCallback(callback,p.provider,'web',p.state);
    if(!res.ok)return {ok:false,message:'登入已取消或失敗'};
    if(p.mode==='link'){
      await withAccess(token=>import('@clock/auth-contract').then(m=>m.linkIdentity(token,p.provider,res.idToken,p.nonce,res.authorizationCode)));
      return {ok:true,message:'登入方式已綁定'};
    }
    const signed=await exchangeRelay(p.provider,res.idToken,p.nonce,res.authorizationCode);
    await saveTokens(signed);
    return {ok:true,message:'登入成功'};
  }catch{return {ok:false,message:'登入驗證失敗，請重新操作'};}
}
export async function signOut():Promise<void>{
  try{await withAccess(token=>import('@clock/auth-contract').then(m=>m.logout(token)));}catch{}finally{await clearSession();}
}
export async function signOutEverywhere():Promise<void>{
  await withAccess(token=>import('@clock/auth-contract').then(m=>m.logoutAll(token)));
  await clearSession();
}
