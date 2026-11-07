import React, {useCallback, useEffect, useState} from 'react';
import {Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {updateProfile, StarryApiError} from '@clock/auth-contract';
import appConfig from '../../app.json';
import type {RelayProvider, StarryMe} from '@clock/auth-contract';
import {loadMember, startStarryRelay, signOut, signOutEverywhere, clearSession, withAccess, officialStarryClient, onStarryAuthChange} from './session';
import {StarryError} from './starry-client';
import {OwnerPricingPanel} from './OwnerPricingPanel';

const api='https://id.starry.phd';
const C={fg:'#F7FAFF',bg:'#0B1220',line:'#35445E',panel:'#17263B',muted:'#A7BAD1',mint:'#80F4D6',danger:'#FF8E95'};
function Btn({label,onPress,danger=false}:{label:string;onPress:()=>void;danger?:boolean}){
 return <Pressable accessibilityRole="button" onPress={onPress} style={[s.btn,danger&&{borderColor:C.danger}]}><Text style={[s.btnText,danger&&{color:C.danger}]}>{label}</Text></Pressable>;
}
async function confirmAction(title:string,message:string):Promise<boolean>{
 if(Platform.OS==='web')return typeof window!=='undefined' && window.confirm(title+'\n'+message);
 return await new Promise(resolve=>Alert.alert(title,message,[{text:'取消',style:'cancel',onPress:()=>resolve(false)},{text:'確認',style:'destructive',onPress:()=>resolve(true)}]));
}
export function StarryAccountPanel(){
 const [me,setMe]=useState<StarryMe|null>(null);
 const [status,setStatus]=useState('正在檢查 Starry ID…');
 const [busy,setBusy]=useState(false);
 const [displayName,setDisplayName]=useState('');
 const [deletePhrase,setDeletePhrase]=useState('');
 const [battery,setBattery]=useState('');
 const [passkeys,setPasskeys]=useState<{id:string;name:string;created_at:number;last_used_at:number|null}[]>([]);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  const config=await officialStarryClient().checkApp(appConfig.expo.version);
  const gateMessage=config.state==='ok'?'已連線，中央會員登記有效':
    config.state==='unreachable'?'中央會員暫時無法連線':
    config.state==='maintenance'?'Clock 目前維護中':
    config.state==='killed'?'Clock 已停用，請聯絡客服':'請更新 Clock App';
  setStatus(gateMessage);
  if(config.state!=='ok')return;
  const member=await loadMember();
  setMe(member);setDisplayName(member?.profile.display_name??'');
  if(member){
   if(!member.consent.required){
    try{setPasskeys(await officialStarryClient().listPasskeys());}
    catch{setPasskeys([]);}
   }else setPasskeys([]);
   try{
    const value=await officialStarryClient().request<{
     balance:{period:string;allowance:number;used:number;reserved:number;remaining:number};
     quantum?:{balance:number;available:number}|null;
    }>('GET','/v1/me/battery');
    const bal=value.balance;
    const quantum=value.quantum;
    setBattery(`本月 ${bal.period}｜額度 ${bal.allowance} 顆｜已用 ${bal.used} 顆｜預留 ${bal.reserved} 顆｜剩餘 ${bal.remaining} 顆`
      +(quantum?`\n此 App 量子電池：餘額 ${quantum.balance} 顆｜可用 ${quantum.available} 顆`:''));
    // Free allowance is shared; Quantum is restricted to this App. This is read-only.
   }catch{setBattery('額度暫時無法讀取');}
  }else {setBattery('');setPasskeys([]);}
 },[]);
 useEffect(()=>{void refresh().catch(()=>setStatus('中央會員暫時無法連線'));},[refresh]);
 useEffect(()=>onStarryAuthChange(()=>{void refresh().catch(()=>{});}),[refresh]);
 async function action(task:()=>Promise<void>){
  if(busy)return;
  setBusy(true);setError('');
  try{await task();await refresh();}
  catch(e){
   if(e instanceof StarryError&&e.cancelled)return; // system sheet dismissed intentionally
   const err=e as Error;
   setError(e instanceof StarryApiError
    ? (e.code==='IDENTITY_IN_USE'?'此登入方式已綁定其他帳號。為避免誤合併，請到 Starry ID 帳號中心確認。':err.message)
    :err.message||'無法完成操作');
  }finally{setBusy(false);}
 }
 function login(p:RelayProvider){void action(async()=>{await startStarryRelay(p);});}
 function loginPasskey(){void action(async()=>{await officialStarryClient().signInWithPasskey();});}
 function createPasskey(){void action(async()=>{
  await officialStarryClient().registerPasskey();
 });}
 function removePasskey(id:string){
  void (async()=>{
   if(!await confirmAction('移除通行密鑰','確定移除這組 Passkey？請先確保另一種登入方式仍可使用。'))return;
   await action(()=>officialStarryClient().removePasskey(id));
  })();
 }
 async function agree(){
  if(!me)return;
  const ok=await confirmAction('同意條款','請先閱讀 Starry ID 的服務條款與隱私權政策。確認同意目前版本？');
  if(!ok)return;
  await action(()=>officialStarryClient().acceptConsent());
 }
 async function saveName(){
  if(!me)return;
  const name=displayName.trim();
  if(!name || name.length>50){setError('名稱需為 1～50 字');return;}
  await action(async()=>{await withAccess(t=>updateProfile(t,me.profile.version,{display_name:name}));});
 }
 async function deleteSelf(){
  if(deletePhrase.trim()!=='DELETE'){setError('請先輸入 DELETE 才能進行永久刪除');return;}
  const ok=await confirmAction('永久刪除 Starry 帳號','確認後將立即永久刪除會員帳號，無法撤回，且不會自動取消 App Store／Google Play 訂閱。');
  if(!ok)return;
  await action(async()=>{await officialStarryClient().deleteAccount();await clearSession();setMe(null);setDeletePhrase('');});
 }
 function contactSupport(){
  const build=Platform.OS==='ios'?appConfig.expo.ios.buildNumber:Platform.OS==='android'?appConfig.expo.android.versionCode:'Web';
  const model=String((Platform.constants as unknown as Record<string,unknown>).Model||Platform.OS);
  const url=api+'/support?app_id=clock&app_version='+encodeURIComponent(appConfig.expo.version+' ('+build+')')+'&device='+encodeURIComponent(model);
  void Linking.openURL(url);
 }
 return <ScrollView style={s.root} keyboardShouldPersistTaps="handled">
  <Text style={s.title}>Starry ID 中央會員</Text>
  <Text style={s.info}>{status}</Text>
  {error?<Text style={s.error}>{error}</Text>:null}
  {!me?<View style={s.block}>
    <Text style={s.info}>不需登入也能使用倒數計時。登入只由 Starry ID 中繼辦理；不會將 Apple、Google 密碼傳給 Clock。</Text>
    <Btn label="透過 Google 登入" onPress={()=>login('google')}/>
    <Btn label="透過 Apple 登入" onPress={()=>login('apple')}/>
    <Btn label="使用 Passkey 通行密鑰登入" onPress={loginPasskey}/>
    <Btn label="重新檢查登入狀態" onPress={()=>{void action(async()=>{});}}/>
   </View>:<View style={s.block}>
    <Text style={s.name}>{me.profile.display_name||'繁星會員'}</Text>
    <Text style={s.info}>會員 ID：{me.user_id}</Text>
    <Text style={s.info}>帳號狀態：{me.status}</Text>
    {me.status==='pending_deletion'?<>
      <Text style={s.error}>此帳號仍顯示舊版刪除申請狀態，請聯絡 Starry ID 客服確認。</Text>
    </>:<>
      {me.consent.required?<View style={s.warning}>
       <Text style={s.warnText}>必須先同意最新服務條款與隱私權政策。</Text>
       <Btn label="閱讀服務條款" onPress={()=>{void Linking.openURL(api+'/terms');}}/>
       <Btn label="閱讀隱私權政策" onPress={()=>{void Linking.openURL(api+'/privacy');}}/>
       <Btn label="我已閱讀並同意最新條款" onPress={()=>{void agree();}}/>
      </View>:null}
      {!me.consent.required?<View style={s.block}>
        <Text style={s.info}>顯示名稱</Text>
        <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} maxLength={50} placeholder="顯示名稱" placeholderTextColor={C.muted}/>
        <Btn label="儲存會員名稱" onPress={()=>{void saveName();}}/>
        <Btn label="會員資料／頭像管理" onPress={()=>{void Linking.openURL(api+'/account');}}/>
        <Text style={s.info}>其他登入方式與頭像可從 Starry ID 帳號中心管理，不會在 Clock 建立獨立會員資料。</Text>
        <Btn label="綁定 Apple 登入方式" onPress={()=>{void action(async()=>{await startStarryRelay('apple','link');});}}/>
        <Btn label="綁定 Google 登入方式" onPress={()=>{void action(async()=>{await startStarryRelay('google','link');});}}/>
        <View style={s.passkeyPanel}>
          <Text style={s.name}>Passkey 通行密鑰</Text>
          <Text style={s.info}>透過裝置指紋、Face ID 或螢幕鎖定登入 Starry ID。需要已安裝原生版本及正確的網域關聯。</Text>
          <Btn label="新增通行密鑰" onPress={createPasskey}/>
          <Btn label="重新整理通行密鑰" onPress={()=>{void action(async()=>{});}}/>
          {passkeys.length===0?<Text style={s.info}>尚未註冊任何通行密鑰</Text>:
           passkeys.map(p=><View key={p.id} style={s.passkeyRow}>
            <Text style={[s.info,{flex:1}]} numberOfLines={2}>{p.name||'通行密鑰'}</Text>
            <Btn label="移除" onPress={()=>removePasskey(p.id)} danger/>
           </View>)}
        </View>
        <Text style={s.info}>繁星電池艙 Starry Battery｜會員共用的消費用量月額度</Text>
        <Text style={s.info}>{battery||'尚未取得'}</Text>
        <OwnerPricingPanel userId={me.user_id}/>
        <Text style={s.info}>月額度跨已授權 Starry Apps 共用，適用核准的 AI 與非 AI 服務；每月 1 日（台灣時間）恢復。此頁僅查詢，不會扣額。</Text>
      </View>:null}
      <Btn label={Platform.OS==='ios'?'登出所有繁星 App':'登出 Clock（Android 共用登入待驗證）'} onPress={()=>{void action(async()=>{await signOut();setMe(null);});}}/>
      <Btn label="登出所有裝置" onPress={()=>{void action(async()=>{if(await confirmAction('登出所有裝置','這會使全部 Starry ID 裝置的登入狀態失效。')){await signOutEverywhere();setMe(null);}});}}/>
      <Text style={s.error}>永久刪除前，請先輸入 DELETE；無法恢復，也不會自動取消商店訂閱。</Text>
      <TextInput style={s.input} value={deletePhrase} onChangeText={setDeletePhrase}
        placeholder="輸入 DELETE 確認" placeholderTextColor={C.muted} autoCapitalize="characters"/>
      <Btn danger label="永久刪除 Starry 會員帳號" onPress={()=>{void deleteSelf();}}/>
    </>}
   </View>}
  {busy?<Text style={s.info}>正在處理…</Text>:null}
  <Btn label="聯絡客服" onPress={contactSupport}/>
  <Btn label="開啟 Starry ID 網頁帳號中心" onPress={()=>{void Linking.openURL(api+'/account');}}/>
 </ScrollView>;
}
const s=StyleSheet.create({
 root:{maxHeight:480},title:{color:C.fg,fontSize:18,fontWeight:'800',marginBottom:10},
 block:{gap:9,marginVertical:9},info:{color:C.muted,fontSize:13,lineHeight:20,flexWrap:'wrap'},
 name:{color:C.mint,fontWeight:'700',fontSize:20},error:{color:C.danger,fontSize:14,marginVertical:8},
 btn:{padding:10,borderWidth:1,borderColor:C.line,backgroundColor:C.bg,borderRadius:9},
 btnText:{color:C.fg,textAlign:'center',fontWeight:'700'},input:{color:C.fg,borderColor:C.line,borderWidth:1,borderRadius:8,padding:10},
 warning:{padding:10,borderColor:'#997D3A',borderWidth:1,borderRadius:10,gap:7},warnText:{color:'#FFCD75'},
 passkeyPanel:{borderWidth:1,borderColor:C.line,borderRadius:10,padding:12,gap:8},
 passkeyRow:{flexDirection:'row',alignItems:'center',gap:10,justifyContent:'space-between'},
});
