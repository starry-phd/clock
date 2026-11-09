import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, AppState, Image, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View} from 'react-native';
import {useRouter} from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {updateProfile, StarryApiError} from '@clock/auth-contract';
import appConfig from '../../app.json';
import type {RelayProvider, StarryMe} from '@clock/auth-contract';
import {loadMember, startStarryRelay, signOut, signOutEverywhere, clearSession, withAccess, officialStarryClient, onStarryAuthChange} from './session';
import {StarryError, starrySettingsBlocks, type SettingsButtonId} from './starry-client';

const api='https://id.starry.phd';
// Signed Starry ID avatars are refreshed by /v1/me; the logical image cache key
// is the URL path before '?' (never member_no or user_id). Never persist bytes.
function centralAvatar(raw:unknown):{uri:string;cacheKey:string}|null{
 if(typeof raw!=='string'||!raw)return null;
 try{
  const url=new URL(raw,api);
  if(url.origin!==api||!url.pathname.startsWith('/v1/avatars/'))return null;
  return {uri:url.href,cacheKey:url.pathname};
 }catch{return null;}
}
const C={fg:'#F7FAFF',bg:'#0B1220',line:'#35445E',panel:'#17263B',muted:'#A7BAD1',mint:'#80F4D6',danger:'#FF8E95'};
function Btn({label,onPress,danger=false,inverse=false}:{label:string;onPress:()=>void;danger?:boolean;inverse?:boolean}){
 return <Pressable accessibilityRole="button" onPress={onPress} style={[s.btn,danger&&{borderColor:C.danger},inverse&&{backgroundColor:C.mint}]}><Text style={[s.btnText,danger&&{color:C.danger},inverse&&{color:C.bg}]}>{label}</Text></Pressable>;
}
async function confirmAction(title:string,message:string):Promise<boolean>{
 if(Platform.OS==='web')return typeof window!=='undefined' && window.confirm(title+'\n'+message);
 return await new Promise(resolve=>Alert.alert(title,message,[{text:'取消',style:'cancel',onPress:()=>resolve(false)},{text:'確認',style:'destructive',onPress:()=>resolve(true)}]));
}
export function StarryAccountPanel(){
 const router=useRouter();
 const [me,setMe]=useState<StarryMe|null>(null);
 const [status,setStatus]=useState('正在檢查 Starry ID…');
 const [busy,setBusy]=useState(false);
 const [displayName,setDisplayName]=useState('');
 const [deletePhrase,setDeletePhrase]=useState('');
 const [battery,setBattery]=useState('');
 const [batterySummary,setBatterySummary]=useState<{balance:{remaining:number};quantum:{available:number}}|null>(null);
 const [confirmDelete,setConfirmDelete]=useState(false);
 const [avatarFailed,setAvatarFailed]=useState(false);
 const previousAvatarPath=useRef<string|null>(null);
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
  // Avatar path changes when the member replaces the avatar; avoid keying it
  // to a one-hour signature or to user_id. A new path must refresh all views.
  const nextAvatarPath=centralAvatar(member?.profile?.avatar_url)?.cacheKey??null;
  if(previousAvatarPath.current!==nextAvatarPath){
   previousAvatarPath.current=nextAvatarPath;
   setAvatarFailed(false);
  }
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
    setBatterySummary({balance:{remaining:bal.remaining},quantum:{available:quantum?.available??0}});
    setBattery(`🔋 ${bal.remaining} 顆普通電池（本月 ${bal.period}，額度 ${bal.allowance} 顆、已用 ${bal.used} 顆、預留 ${bal.reserved} 顆）`
      +(quantum?`\n⚛️ ${quantum.available} 顆量子電池（此 App 餘額 ${quantum.balance} 顆）`:''));
    // Free allowance is shared; Quantum is restricted to this App. This is read-only.
   }catch{setBattery('額度暫時無法讀取');setBatterySummary(null);}
  }else {setBattery('');setBatterySummary(null);setPasskeys([]);}
 },[]);
 useEffect(()=>{void refresh().catch(()=>setStatus('中央會員暫時無法連線'));},[refresh]);
 useEffect(()=>onStarryAuthChange(()=>{void refresh().catch(()=>{});}),[refresh]);
 // Re-read the signed avatar and chosen shown_name whenever Clock resumes.
 useEffect(()=>{
  const subscription=AppState.addEventListener('change',state=>{
   if(state==='active')void refresh().catch(()=>{});
  });
  return()=>subscription.remove();
 },[refresh]);
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
 // Member numbers are public, mutable display handles, NEVER a primary key.
 // Read the latest /v1/me on each settings screen entry/refresh.
 const memberNo=typeof me?.member_no==='string'&&/^[A-Z]{2}\d{7,10}$/.test(me.member_no)?me.member_no:null;
 const signedAvatar=centralAvatar(me?.profile?.avatar_url);
 const shownName=me?.profile?.shown_name??me?.profile?.initials??'?';
 async function latestMemberNo():Promise<string|null>{
  // Member number can be changed at any time in the central account: fetch
  // GET /v1/me immediately before opening either public or invitation link.
  const fresh=await loadMember();
  setMe(fresh);
  const no=fresh?.member_no;
  return typeof no==='string'&&/^[A-Z]{2}\d{7,10}$/.test(no)?no:null;
 }
 function openPublicProfile(){
  void (async()=>{
   try{
    const no=await latestMemberNo();
    if(!no){setError('會員編號尚未取得，請重新整理會員資料');return;}
    await Linking.openURL(api+'/'+encodeURIComponent(no));
   }catch{setError('無法開啟公開會員頁');}
  })();
 }
 function shareInvite(){
  void (async()=>{
   try{
    const no=await latestMemberNo();
    if(!no){setError('會員編號尚未取得，請重新整理會員資料');return;}
    const inviteUrl=api+'/Invite/'+encodeURIComponent(no);
    await Share.share({message:inviteUrl});
   }catch{setError('無法開啟系統分享功能');}
  })();
 }
 async function openCentralPage(page:'battery'|'profile'|'referral'|'network'|'apps'){
  // One-time, short-lived, member-authorized link: never reuse or log it.
  const response=await officialStarryClient().request<{url:string}>('POST','/v1/me/web-link',{page});
  if(!response?.url)throw Error('中央會員頁面暫時無法開啟');
  if(Platform.OS==='web')await Linking.openURL(response.url);
  else await WebBrowser.openBrowserAsync(response.url);
 }
 function onSettingsButton(id:SettingsButtonId){
  if(id==='admin'){router.push('/admin');return;}
  if(id==='public-profile'){openPublicProfile();return;}
  if(id==='share-invite'){shareInvite();return;}
  if(id==='support'){contactSupport();return;}
  if(id==='delete-account'){setConfirmDelete(true);return;}
  if(id==='sign-out-all'){void action(async()=>{await signOut();setMe(null);});return;}
  if(id==='add-passkey'){createPasskey();return;}
  if(id==='member-center'){void action(()=>openCentralPage('profile'));return;}
  if(id==='battery-history'){void action(()=>openCentralPage('battery'));return;}
 }
 function contactSupport(){
  const build=Platform.OS==='ios'?appConfig.expo.ios.buildNumber:Platform.OS==='android'?appConfig.expo.android.versionCode:'Web';
  const model=String((Platform.constants as unknown as Record<string,unknown>).Model||Platform.OS);
  const url=api+'/support?app_id=clock&app_version='+encodeURIComponent(appConfig.expo.version+' ('+build+')')+'&device='+encodeURIComponent(model);
  void Linking.openURL(url);
 }
 const blocks=starrySettingsBlocks({
  me:me as unknown as Parameters<typeof starrySettingsBlocks>[0]['me'],
  battery:batterySummary,passkeys
 });
 return <ScrollView style={s.root} keyboardShouldPersistTaps="handled">
  {error?<Text style={s.error}>{error}</Text>:null}
  {!me?<View style={s.block}>
    <Btn label="透過 Google 登入" onPress={()=>login('google')}/>
    <Btn label="透過 Apple 登入" onPress={()=>login('apple')}/>
    <Btn label="使用 Passkey 登入" onPress={loginPasskey}/>
   </View>:null}
  {blocks.map(block=><View key={block.id} style={s.sdkBlock}>
    <Text style={s.sdkTitle}>{block.title}</Text>
    {block.avatar?<View style={s.memberHeader}>
      {signedAvatar&&!avatarFailed
       ?<Image key={signedAvatar.cacheKey} source={{uri:signedAvatar.uri}} style={s.avatar}
          onError={()=>setAvatarFailed(true)} accessibilityLabel="Starry ID 會員頭像"/>
       :<View style={s.avatarFallback}><Text style={s.avatarInitials}>{block.avatar.initials||'?'}</Text></View>}
      <Text style={s.name}>{block.name}</Text>
     </View>:null}
    {block.lines.map((line,i)=><Text key={String(i)} style={s.info}>{line}</Text>)}
    {block.passkeys?.map(item=><View key={item.id} style={s.passkeyRow}>
      <Text style={[s.info,{flex:1}]}>{item.name}</Text>
      <Btn label={item.removeLabel} danger onPress={()=>removePasskey(item.id)}/>
    </View>)}
    {block.buttons.map(button=><Btn key={button.id} label={(button.icon==='gear'?'⚙ ':'')+button.label}
      danger={button.danger} inverse={button.inverse}
      onPress={()=>onSettingsButton(button.id)}/>)}
    {block.id==='member'&&me?.consent.required?<View style={s.warning}>
      <Btn label="閱讀服務條款" onPress={()=>{void Linking.openURL(api+'/terms')}}/>
      <Btn label="閱讀隱私權政策" onPress={()=>{void Linking.openURL(api+'/privacy')}}/>
      <Btn label="我已閱讀並同意最新條款" onPress={()=>{void agree()}}/>
     </View>:null}
    {block.id==='member'&&confirmDelete?<View style={s.warning}>
      <TextInput style={s.input} value={deletePhrase} onChangeText={setDeletePhrase}
       placeholder="輸入 DELETE 確認" placeholderTextColor={C.muted} autoCapitalize="characters"/>
      <Btn danger label="確認永久刪除" onPress={()=>{void deleteSelf()}}/>
      <Btn label="取消" onPress={()=>setConfirmDelete(false)}/>
     </View>:null}
   </View>)}
  {busy?<Text style={s.info}>正在處理…</Text>:null}
 </ScrollView>;
}
const s=StyleSheet.create({
 root:{maxHeight:480},title:{color:C.fg,fontSize:18,fontWeight:'800',marginBottom:10},
 sdkBlock:{gap:9,padding:13,borderWidth:1,borderColor:C.line,borderRadius:14,backgroundColor:C.panel,marginBottom:12},
 sdkTitle:{fontSize:19,fontWeight:'800',color:C.fg,marginBottom:4},
 block:{gap:9,marginVertical:9},info:{color:C.muted,fontSize:13,lineHeight:20,flexWrap:'wrap'},
 name:{color:C.mint,fontWeight:'700',fontSize:20},error:{color:C.danger,fontSize:14,marginVertical:8},
 btn:{padding:10,borderWidth:1,borderColor:C.line,backgroundColor:C.bg,borderRadius:9},
 btnText:{color:C.fg,textAlign:'center',fontWeight:'700'},input:{color:C.fg,borderColor:C.line,borderWidth:1,borderRadius:8,padding:10},
 warning:{padding:10,borderColor:'#997D3A',borderWidth:1,borderRadius:10,gap:7},warnText:{color:'#FFCD75'},
 passkeyPanel:{borderWidth:1,borderColor:C.line,borderRadius:10,padding:12,gap:8},
 passkeyRow:{flexDirection:'row',alignItems:'center',gap:10,justifyContent:'space-between'},
 memberHeader:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:5},
 avatar:{width:62,height:62,borderRadius:31,backgroundColor:C.panel},
 avatarFallback:{width:62,height:62,borderRadius:31,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,
  alignItems:'center',justifyContent:'center'},
 avatarInitials:{color:C.mint,fontSize:22,fontWeight:'800'},
});
