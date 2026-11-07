/**
 * Expo iOS / Android native passkey bridge to Starry ID's official SDK.
 * Kept separate from session.ts so Expo Go and unsupported devices never
 * eagerly load the native module at App startup.
 * The central RP ID is id.starry.phd; Clock never creates a second identity.
 */
import {StarryError, type PasskeyAdapter} from './starry-client';

type NativePasskeys = typeof import('react-native-passkeys');

function library():NativePasskeys {
 try {
  const lib=require('react-native-passkeys') as NativePasskeys;
  if(typeof lib?.isSupported!=='function'||!lib.isSupported())
   throw new StarryError(0,'PASSKEY_UNSUPPORTED','此裝置不支援通行密鑰，請改用 Google／Apple 登入');
  return lib;
 } catch(error) {
  if(error instanceof StarryError)throw error;
  throw new StarryError(0,'PASSKEY_UNSUPPORTED','此版本尚未包含原生通行密鑰，請使用安裝版或 Google／Apple 登入');
 }
}
function translate(error:unknown):never {
 if(error instanceof StarryError)throw error;
 const e=error as {name?:string;error?:string;message?:string}|null;
 const code=e?.error??e?.name??'';
 if(['UserCancelled','NotAllowedError','AbortError'].includes(code))
  throw new StarryError(0,'PASSKEY_CANCELLED','通行密鑰操作已取消');
 if(['NotSupported','NotSupportedError','BadConfiguration','SecurityError'].includes(code))
  throw new StarryError(0,'PASSKEY_UNSUPPORTED','請確認裝置與 Starry ID 網域／Android 憑證設定');
 if(code==='NoCredentials')
  throw new StarryError(0,'PASSKEY_NONE','找不到通行密鑰，請改用 Apple 或 Google 登入');
 if(code==='InvalidStateError'||code==='CredentialAlreadyExists')
  throw new StarryError(0,'PASSKEY_EXISTS','這台裝置已註冊相同的通行密鑰');
 throw new StarryError(0,'PASSKEY_FAILED',e?.message??'通行密鑰驗證失敗');
}
function valid(value:unknown):value is string{
 return typeof value==='string'&&value.length>0&&/^[A-Za-z0-9_-]+$/.test(value);
}
export const nativePasskeyAdapter:PasskeyAdapter={
 async get(publicKey){
  if(publicKey.rpId!=='id.starry.phd')throw new StarryError(0,'PASSKEY_RP_MISMATCH','中央會員網域驗證失敗');
  try {
   const lib=library();
   const value=await lib.get(publicKey as Parameters<NativePasskeys['get']>[0]);
   if(!value||!valid(value.id)||!valid(value.response?.clientDataJSON)||!valid(value.response?.authenticatorData)||!valid(value.response?.signature))
    throw new StarryError(0,'PASSKEY_FAILED','通行密鑰回傳資料不完整');
   return {id:value.id,clientDataJSON:value.response.clientDataJSON,
    authenticatorData:value.response.authenticatorData,signature:value.response.signature};
  }catch(error){translate(error)}
 },
 async create(publicKey){
  const rp=publicKey.rp as {id?:unknown}|undefined;
  if(rp?.id!=='id.starry.phd')throw new StarryError(0,'PASSKEY_RP_MISMATCH','中央會員網域驗證失敗');
  try {
   const lib=library();
   const value=await lib.create(publicKey as Parameters<NativePasskeys['create']>[0]);
   if(!value||!valid(value.response?.clientDataJSON)||!valid(value.response?.attestationObject))
    throw new StarryError(0,'PASSKEY_FAILED','通行密鑰回傳資料不完整');
   return {clientDataJSON:value.response.clientDataJSON,attestationObject:value.response.attestationObject};
  }catch(error){translate(error)}
 }
};
