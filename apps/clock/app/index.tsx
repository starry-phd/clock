import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, useWindowDimensions, View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import * as Crypto from 'expo-crypto';
import {
  ClockPreset, DEFAULT_PRESETS, formatCountdown, formatLocalClock,
  newTimer, pauseTimer, sanitizePresets, startTimer, tickTimer, TimerSnapshot
} from '@clock/core';
import {readAppConfig} from '@clock/auth-contract';
import {StarryAccountPanel} from '../src/auth/StarryAccountPanel';
import {loadClockPricing,createChargedPreset,readCloudPresets,editCloudPreset,removeCloudPreset,
  initializeFreePresets,addFreePreset,editFreePreset,removeFreePreset, type FreePreset} from '../src/auth/clockApi';
import {loadMember} from '../src/auth/session';

const DATA_KEY = 'clock:preferences:v1';
const COLORS = { bg:'#0B1220', panel:'#162338', muted:'#9CB1CA', fg:'#F7FAFF', mint:'#80F4D6', orange:'#FFCA75', line:'#29364A', danger:'#FF8E95' };
type Editor = { id: string | null; name: string; minutes: string; seconds: string };
const emptyEditor = (): Editor => ({ id:null, name:'', minutes:'5', seconds:'0' });
function Button({ label, onPress, primary=false, disabled=false }: { label:string; onPress:()=>void; primary?:boolean; disabled?:boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={[styles.button, primary&&styles.primaryButton, disabled&&{opacity:.4}]}>
    <Text style={[styles.buttonText, primary&&{color:COLORS.bg}]}>{label}</Text>
  </Pressable>;
}

export default function ClockScreen() {
  useKeepAwake();
  const {width,height}=useWindowDimensions();
  const player=useAudioPlayer(require('../assets/chime.wav'));
  const [mode,setMode]=useState<'timer'|'clock'>('timer');
  const [now,setNow]=useState(Date.now());
  const [presets,setPresets]=useState<ClockPreset[]>(DEFAULT_PRESETS);
  const [selectedId,setSelectedId]=useState(DEFAULT_PRESETS[0].id);
  const [alertSeconds,setAlertSeconds]=useState(10);
  const [muted,setMuted]=useState(false);
  const [editor,setEditor]=useState<Editor|null>(null);
  const [settings,setSettings]=useState(false);
  const [settingSeconds,setSettingSeconds]=useState('10');
  const [ready,setReady]=useState(false);
  const [cloudIds,setCloudIds]=useState<string[]>([]);
  const [freeSlots,setFreeSlots]=useState<FreePreset[]>([]);
  const [freeSyncReady,setFreeSyncReady]=useState(false);
  const [saving,setSaving]=useState(false);
  const pendingCreate=useRef<{fingerprint:string;requestId:string;presetId:string}|null>(null);
  const [memberStatus,setMemberStatus]=useState('檢查中…');
  const [centralGate,setCentralGate]=useState<{blocked:boolean;message:string;notices:string[]}>({blocked:false,message:'',notices:[]});
  const checkCentralGate=useCallback(async()=>{
    const result=await readAppConfig();
    if(result.kind==='active'){
      const time=Date.now();
      const messages=(result.value.notices||[]).filter(n=>n.starts_at<=time&&n.ends_at>=time).map(n=>n.message);
      setCentralGate({blocked:false,message:'',notices:messages});
      setMemberStatus('中央 App 已登記');
    }else{
      // A network outage should not block the offline countdown.
      const blocked=result.kind==='disabled'||result.kind==='update_required';
      setCentralGate({blocked,message:result.message,notices:[]});
      setMemberStatus(result.message);
    }
  },[]);
  const [timer,setTimer]=useState<TimerSnapshot>(newTimer(DEFAULT_PRESETS[0].durationSeconds));
  const timerRef=useRef(timer);
  const leadRef=useRef(alertSeconds);
  const muteRef=useRef(muted);
  const presetsRef=useRef(presets);
  const selectedRef=useRef(selectedId);
  const play=useCallback(()=>{
    if(muteRef.current) return;
    try { player.seekTo(0).catch(()=>{}); player.play(); } catch {}
  },[player]);
  const setTimerSync=useCallback((next:TimerSnapshot)=>{timerRef.current=next;setTimer(next);},[]);

  useEffect(()=>{leadRef.current=alertSeconds;muteRef.current=muted;presetsRef.current=presets;selectedRef.current=selectedId;},[alertSeconds,muted,presets,selectedId]);
  useEffect(()=>{
    let mounted=true;
    AsyncStorage.getItem(DATA_KEY).then(v=>{
      if(!mounted||!v)return;
      try{
        const a=JSON.parse(v);
        const p=sanitizePresets(a.presets);
        const s=p.some(x=>x.id===a.selectedId)?a.selectedId:p[0].id;
        const lead=Number.isInteger(a.alertSeconds)?Math.min(120,Math.max(0,a.alertSeconds)):10;
        setPresets(p);setSelectedId(s);setAlertSeconds(lead);setSettingSeconds(String(lead));setMuted(Boolean(a.muted));setTimerSync(newTimer(p.find(x=>x.id===s)!.durationSeconds));
      }catch{}
    }).finally(()=>{if(mounted)setReady(true)});
    return()=>{mounted=false};
  },[setTimerSync]);
  useEffect(()=>{
    if(!ready)return;
    AsyncStorage.setItem(DATA_KEY,JSON.stringify({presets,selectedId,alertSeconds,muted})).catch(()=>{});
  },[ready,presets,selectedId,alertSeconds,muted]);
  useEffect(()=>{
    void checkCentralGate().catch(()=>setMemberStatus('中央會員暫時無法連線'));
  },[checkCentralGate]);
  useEffect(()=>{
    const t=setInterval(()=>{
      const ms=Date.now();setNow(ms);
      const result=tickTimer(timerRef.current,ms,leadRef.current);
      if(result.timer!==timerRef.current)setTimerSync(result.timer);
      if(result.alert||result.finished)play();
    },120);
    // On resume, one extra tick catches an expired timer without losing time.
    const s=AppState.addEventListener('change',state=>{
      if(state==='active'){
        const ms=Date.now(); const r=tickTimer(timerRef.current,ms,leadRef.current);
        setNow(ms);setTimerSync(r.timer);if(r.alert||r.finished)play();
        void checkCentralGate().catch(()=>{}); // Re-check on resume, not in a polling loop.
      }
    });
    return()=>{clearInterval(t);s.remove()};
  },[play,setTimerSync,checkCentralGate]);

  // Cloud is authoritative for a signed-in member's three free slots + paid extras.
  // If old local presets differ, back them up before switching to the cloud copy.
  // Offline and unsigned-in timers keep working exactly as before.
  useEffect(()=>{
    if(!ready)return;
    let live=true;
    setFreeSyncReady(false);
    void (async()=>{
      const {presets:remote}=await readCloudPresets();
      if(!live)return;
      setCloudIds(remote.map(p=>p.id));
      const member=await loadMember();
      if(!member||!live)return;
      const oldOwner=await AsyncStorage.getItem('clock:free-owner:v1');
      const saved=presetsRef.current;
      const remoteIds=new Set(remote.map(p=>p.id));
      const localFree=oldOwner&&oldOwner!==member.user_id
        ? DEFAULT_PRESETS
        : saved.filter(p=>!remoteIds.has(p.id)).slice(0,3);
      const seed=localFree.length?localFree:DEFAULT_PRESETS;
      let free;
      try{free=(await initializeFreePresets(seed)).presets;}catch{
        // Older deployed API / temporary outage: preserve all local timers,
        // and continue to merge the separately stored paid timers.
        if(live)setPresets(old=>{
          const existing=new Set(old.map(p=>p.id));
          return sanitizePresets([...old,...remote.filter(p=>!existing.has(p.id))]);
        });
        return;
      }
      if(!live)return;
      const canonical:ClockPreset[]=[...free.map(p=>({id:p.id,name:p.name,durationSeconds:p.durationSeconds})),...remote];
      const known=new Set(canonical.map(p=>p.id));
      const legacy=saved.filter(p=>!known.has(p.id));
      if(legacy.length){
        const backupKey='clock:legacy-free-backup:v2:'+(oldOwner||member.user_id);
        const existing=await AsyncStorage.getItem(backupKey);
        const prior:ClockPreset[]=existing?sanitizePresets(JSON.parse(existing)):[];
        const seen=new Set(prior.map(p=>p.id));
        await AsyncStorage.setItem(backupKey,JSON.stringify([...prior,...legacy.filter(p=>!seen.has(p.id))]));
      }
      await AsyncStorage.setItem('clock:free-owner:v1',member.user_id);
      if(!live)return;
      setFreeSlots(free);
      setFreeSyncReady(true);
      const next=sanitizePresets(canonical);
      setPresets(next);
      const select=next.find(p=>p.id===selectedRef.current)||next[0];
      if(select){setSelectedId(select.id);setTimerSync(newTimer(select.durationSeconds));}
    })().catch(()=>{}); // offline countdown never depends on login
    return()=>{live=false};
  },[ready,settings,setTimerSync]);

  const choose=useCallback((p:ClockPreset)=>{setSelectedId(p.id);setTimerSync(newTimer(p.durationSeconds));},[setTimerSync]);
  const toggle=useCallback(()=>{
    const cur=timerRef.current;
    setTimerSync(cur.status==='running'?pauseTimer(cur,Date.now()):startTimer(cur,Date.now()));
  },[setTimerSync]);
  const reset=useCallback(()=>{const p=presets.find(x=>x.id===selectedId)||presets[0];setTimerSync(newTimer(p.durationSeconds));},[presets,selectedId,setTimerSync]);
  const saveEditor=useCallback(async()=>{
    if(!editor||saving)return;
    const name=editor.name.trim(),m=Number(editor.minutes),seconds=Number(editor.seconds);
    if(!name||name.length>24||!Number.isInteger(m)||!Number.isInteger(seconds)||m<0||m>1439||seconds<0||seconds>59||(m===0&&seconds===0)){
      Alert.alert('請檢查設定','名稱 1～24 字，時間需介於 00:01 與 1439:59。');return;
    }
    const id=editor.id||pendingCreate.current?.presetId||'custom-'+Date.now()+'-'+Crypto.randomUUID().slice(0,8);
    const next={id,name,durationSeconds:m*60+seconds};
    if(!editor.id&&presets.length>=50){Alert.alert('已達上限','最多儲存 50 組用途。');return;}
    setSaving(true);
    try{
      if(!editor.id&&presets.length>=3&&(!freeSyncReady||freeSlots.length>=3)){
        const p=(await loadClockPricing()).features.find(x=>x.feature==='clock.preset_create');
        if(!p||!p.enabled||!p.available){Alert.alert('電池服務尚未開放','暫時無法以電池新增第 4 組。你可在這個視窗下方免費選擇一組既有用途取代，不增加計時器總數，也不扣電池。');return;}
        const accepted=await new Promise<boolean>(resolve=>Alert.alert(
          '確認消耗繁星電池',
          '新增這一組計時器需扣 '+p.units+' 顆電池。每月額度跨 Starry Apps 共用；只有新增成功才扣。',
          [{text:'取消',style:'cancel',onPress:()=>resolve(false)},{text:'確認新增',onPress:()=>resolve(true)}],
          {cancelable:false}
        ));
        if(!accepted)return;
        const fingerprint=[next.id,next.name,next.durationSeconds,p.units].join('|');
        const requestId=pendingCreate.current?.fingerprint===fingerprint
          ? pendingCreate.current.requestId:Crypto.randomUUID();
        pendingCreate.current={fingerprint,requestId,presetId:id};
        await createChargedPreset(next,requestId,p.units);
        pendingCreate.current=null;
        setCloudIds(old=>[...old,id]);
      }else if(!editor.id&&freeSyncReady){
        // A free slot remains free even when this member already has paid extras.
        const result=await addFreePreset(next);
        setFreeSlots(result.presets);
      }else if(editor.id&&freeSyncReady&&freeSlots.some(p=>p.id===editor.id)){
        const existing=freeSlots.find(p=>p.id===editor.id)!;
        const result=await editFreePreset({...existing,...next});
        setFreeSlots(result.presets);
      }else if(editor.id&&cloudIds.includes(editor.id)){
        await editCloudPreset(next);
      }
      const updated=editor.id?presets.map(v=>v.id===id?next:v):[...presets,next];
      setPresets(updated);choose(next);setEditor(null);
    }catch(e){Alert.alert('無法儲存',(e as Error).message||'新增失敗，未完成扣量確認。');}
    finally{setSaving(false);}
  },[editor,presets,choose,cloudIds,saving,freeSyncReady,freeSlots]);
  // Safe fallback when central Battery charging is unavailable:
  // explicitly replace a selected existing preset; never create a fourth or charge.
  const replaceFree=useCallback((target:ClockPreset)=>{
    if(!editor||editor.id||saving||presets.length<3)return;
    const name=editor.name.trim(),minutes=Number(editor.minutes),seconds=Number(editor.seconds);
    if(!name||name.length>24||!Number.isInteger(minutes)||!Number.isInteger(seconds)||
       minutes<0||minutes>1439||seconds<0||seconds>59||(minutes===0&&seconds===0)){
      Alert.alert('請檢查設定','名稱 1～24 字，時間需介於 00:01 與 1439:59。');return;
    }
    const next={id:target.id,name,durationSeconds:minutes*60+seconds};
    Alert.alert('免費取代計時器',
      '確定以「'+name+'」取代「'+target.name+'」？不會增加第 4 組，也不會消耗任何電池。',
      [{text:'取消',style:'cancel'},{text:'確定取代',onPress:()=>{
        void (async()=>{
          setSaving(true);
          try{
            const free=freeSyncReady?freeSlots.find(p=>p.id===target.id):null;
            if(free){
              const result=await editFreePreset({...free,...next});
              setFreeSlots(result.presets);
            }else if(cloudIds.includes(target.id))await editCloudPreset(next);
            setPresets(old=>old.map(p=>p.id===target.id?next:p));
            choose(next);setEditor(null);
          }catch(e){Alert.alert('無法儲存',(e as Error).message||'既有用途未被修改');}
          finally{setSaving(false);}
        })();
      }}]
    );
  },[editor,saving,presets.length,cloudIds,choose,freeSyncReady,freeSlots]);
  const remove=useCallback(async()=>{
    if(!editor?.id||presets.length===1||saving)return;
    setSaving(true);
    try{
      const free=freeSyncReady?freeSlots.find(p=>p.id===editor.id):null;
      if(free){
        const result=await removeFreePreset(free);
        setFreeSlots(result.presets);
      }else if(cloudIds.includes(editor.id)){
        await removeCloudPreset(editor.id); // no refund for prior consumed quota
        setCloudIds(old=>old.filter(x=>x!==editor.id));
      }
      const updated=presets.filter(p=>p.id!==editor.id);
      setPresets(updated);if(selectedId===editor.id)choose(updated[0]);setEditor(null);
    }catch(e){Alert.alert('無法刪除',(e as Error).message||'請稍後再試');}
    finally{setSaving(false);}
  },[editor,presets,selectedId,choose,cloudIds,saving,freeSyncReady,freeSlots]);
  const saveSettings=()=>{
    const n=Number(settingSeconds);
    if(!Number.isInteger(n)||n<0||n>120){Alert.alert('提醒秒數','請輸入 0～120 秒。0 表示只在歸零時響鈴。');return;}
    setAlertSeconds(n);setSettings(false);
  };
  const compact=height<650;
  const digitSize=Math.min(width*.218,height*(compact?.24:.25),250);
  const display=mode==='clock'?formatLocalClock(new Date(now)):formatCountdown(timer.remainingMs/1000);
  const selected=presets.find(x=>x.id===selectedId)||presets[0];

  if(centralGate.blocked)return <View style={[styles.screen,{justifyContent:'center',padding:24,gap:16}]}>
    <Text style={{color:COLORS.fg,fontSize:26,fontWeight:'800'}}>Clock 暫時無法使用</Text>
    <Text style={{color:COLORS.muted,fontSize:17}}>{centralGate.message}</Text>
    <Text style={{color:COLORS.muted}}>請等候業主恢復服務或更新 App；不會自動反覆請求中央服務。</Text>
    <Button label="重新檢查" onPress={()=>{void checkCentralGate();}}/>
  </View>;
  return <View style={styles.screen}>
    {centralGate.notices.length>0?<View style={{padding:10,borderBottomWidth:1,borderColor:COLORS.line}}>
      {centralGate.notices.map((message,i)=><Text key={i} style={{color:COLORS.orange}}>{message}</Text>)}
    </View>:null}
    <View style={styles.top}>
      <Text style={styles.brand}>CLOCK</Text>
      <Pressable onPress={()=>{setSettingSeconds(String(alertSeconds));setSettings(true)}} accessibilityRole="button"><Text style={styles.topAction}>設定 ⚙</Text></Pressable>
    </View>
    <View style={styles.modeRow}>
      <Pressable onPress={()=>setMode('timer')} style={[styles.modeButton,mode==='timer'&&styles.modeSelected]}><Text style={[styles.modeText,mode==='timer'&&styles.modeTextSelected]}>倒數計時</Text></Pressable>
      <Pressable onPress={()=>setMode('clock')} style={[styles.modeButton,mode==='clock'&&styles.modeSelected]}><Text style={[styles.modeText,mode==='clock'&&styles.modeTextSelected]}>時鐘</Text></Pressable>
    </View>
    <View style={[styles.hero,{paddingTop:compact?4:18}]}>
      <Text numberOfLines={1} style={styles.purpose}>{mode==='timer'?selected.name:'現在時間'}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.digits,{fontSize: mode==='timer'?digitSize:digitSize*.68,color:timer.status==='done'&&mode==='timer'?COLORS.orange:COLORS.fg}]}>{display}</Text>
      <Text style={styles.unit}>{mode==='timer'?timer.status==='done'?'時間到': timer.status==='running'?'倒數進行中':'分 : 秒':'時 : 分 : 秒'}</Text>
      {mode==='timer'&&<View style={styles.progressTrack}><View style={[styles.progressFill,{width:`${100*(1-timer.remainingMs/(timer.durationSeconds*1000))}%`}]} /></View>}
    </View>
    {mode==='timer'?<>
      <View style={styles.actions}><Button label={timer.status==='running'?'暫停':'開始'} onPress={toggle} primary/><Button label="重設" onPress={reset}/></View>
      <View style={styles.section}><Text style={styles.sectionHeading}>快速切換用途</Text><Pressable onPress={()=>setEditor(emptyEditor())}><Text style={styles.add}>＋ 新增</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0}} contentContainerStyle={styles.presets}>
        {presets.map(p=><Pressable key={p.id} onPress={()=>choose(p)} onLongPress={()=>setEditor({id:p.id,name:p.name,minutes:String(Math.floor(p.durationSeconds/60)),seconds:String(p.durationSeconds%60)})} style={[styles.preset,selectedId===p.id&&styles.presetActive]}>
          <Text numberOfLines={1} style={[styles.presetName,selectedId===p.id&&{color:COLORS.mint}]}>{p.name}</Text>
          <Text style={styles.presetTime}>{formatCountdown(p.durationSeconds)}</Text>
          <Pressable onPress={()=>setEditor({id:p.id,name:p.name,minutes:String(Math.floor(p.durationSeconds/60)),seconds:String(p.durationSeconds%60)})} hitSlop={9}><Text style={styles.edit}>編輯</Text></Pressable>
        </Pressable>)}
      </ScrollView>
    </>:<Text style={styles.clockHint}>超大字顯示 · 支援橫向與直向</Text>}
    <Text style={styles.foot}>提醒：{alertSeconds===0?'僅結束響鈴':`結束前 ${alertSeconds} 秒`} · {muted?'靜音':'響鈴開啟'} · 可離線使用</Text>

    <Modal transparent visible={!!editor} animationType="fade" onRequestClose={()=>setEditor(null)}><KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS==='ios'?'padding':undefined}><View style={styles.modal}>
      <Text style={styles.modalTitle}>{editor?.id?'編輯用途':'新增用途'}</Text>
      {!editor?.id&&<Text style={styles.note}>前 3 組免費。第 4 組起需先確認電池價格與扣量服務；服務暫停時，可在下方免費取代現有的一組用途。</Text>}
      <Text style={styles.fieldLabel}>名稱</Text>
      <TextInput value={editor?.name||''} onChangeText={name=>setEditor(e=>e?{...e,name}:e)} maxLength={24} placeholder="例如：休息時間" placeholderTextColor={COLORS.muted} style={styles.input}/>
      <Text style={styles.fieldLabel}>倒數長度</Text>
      <View style={{flexDirection:'row',gap:10,alignItems:'center'}}><TextInput value={editor?.minutes||''} onChangeText={minutes=>setEditor(e=>e?{...e,minutes}:e)} keyboardType="number-pad" style={[styles.input,{flex:1}]} /><Text style={styles.fieldLabel}>分</Text><TextInput value={editor?.seconds||''} onChangeText={seconds=>setEditor(e=>e?{...e,seconds}:e)} keyboardType="number-pad" style={[styles.input,{flex:1}]} /><Text style={styles.fieldLabel}>秒</Text></View>
      <View style={styles.modalButtons}><Button label="取消" onPress={()=>setEditor(null)}/><Button label={saving?'處理中…':'儲存'} primary disabled={saving} onPress={()=>{void saveEditor();}}/></View>
      {!editor?.id&&presets.length>=3&&<View style={{gap:6,marginTop:12}}>
        <Text style={styles.fieldLabel}>或免費取代既有用途（不新增、不扣電池）</Text>
        <ScrollView style={{maxHeight:116}} nestedScrollEnabled>
          {presets.map(p=><Pressable key={p.id} disabled={saving} accessibilityRole="button"
             onPress={()=>replaceFree(p)} style={{paddingVertical:9,paddingHorizontal:10,marginVertical:3,borderWidth:1,borderColor:COLORS.muted,borderRadius:8}}>
            <Text style={styles.note}>取代「{p.name}」｜{formatCountdown(p.durationSeconds)}</Text>
          </Pressable>)}
        </ScrollView>
      </View>}
      {!!editor?.id&&presets.length>1&&<Pressable disabled={saving} onPress={()=>{void remove();}}><Text style={[styles.add,{color:COLORS.danger,textAlign:'center',marginTop:18}]}>刪除此用途</Text></Pressable>}
    </View></KeyboardAvoidingView></Modal>

    <Modal transparent visible={settings} animationType="fade" onRequestClose={()=>setSettings(false)}><View style={styles.overlay}><View style={styles.modal}>
      <Text style={styles.modalTitle}>計時器設定</Text>
      <Text style={styles.fieldLabel}>提前響鈴（秒）</Text>
      <TextInput value={settingSeconds} onChangeText={setSettingSeconds} keyboardType="number-pad" style={styles.input} />
      <Text style={styles.fieldLabel}>允許 0～120 秒，倒數歸零也會響鈴。</Text>
      <Pressable style={styles.settingRow} onPress={()=>setMuted(v=>!v)}><Text style={styles.fieldLabel}>提醒音效</Text><Text style={styles.add}>{muted?'已靜音 · 點擊開啟':'已開啟 · 點擊靜音'}</Text></Pressable>
      <Text style={styles.note}>計時器在畫面開啟時運作最穩定。手機鎖屏或系統終止 App 時，不保證準時響鈴。</Text>
      <Text style={styles.fieldLabel}>Starry ID 中央會員：{memberStatus}</Text>
      <StarryAccountPanel />
      <View style={styles.modalButtons}><Button label="取消" onPress={()=>setSettings(false)}/><Button label="套用" onPress={saveSettings} primary/></View>
    </View></View></Modal>
  </View>;
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:COLORS.bg,paddingHorizontal:20,paddingTop:22,paddingBottom:15},
 top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:16},
 brand:{fontSize:17,letterSpacing:5,fontWeight:'900',color:COLORS.mint},topAction:{fontSize:17,color:COLORS.muted},
 modeRow:{flexDirection:'row',padding:4,backgroundColor:COLORS.panel,borderRadius:16},modeButton:{flex:1,alignItems:'center',paddingVertical:13,borderRadius:12},modeSelected:{backgroundColor:COLORS.mint},modeText:{color:COLORS.muted,fontSize:17,fontWeight:'700'},modeTextSelected:{color:COLORS.bg},
 hero:{flex:1,alignItems:'center',justifyContent:'center'},purpose:{color:COLORS.mint,fontSize:22,fontWeight:'700',marginBottom:3},digits:{fontWeight:'900',letterSpacing:-4,fontVariant:['tabular-nums'],includeFontPadding:false},unit:{color:COLORS.muted,fontSize:15,letterSpacing:2,marginTop:5},
 progressTrack:{width:'100%',height:7,backgroundColor:COLORS.line,borderRadius:9,overflow:'hidden',marginTop:22},progressFill:{height:7,backgroundColor:COLORS.mint},
 actions:{flexDirection:'row',gap:12,marginBottom:22},button:{flex:1,borderWidth:1,borderColor:COLORS.line,borderRadius:16,paddingVertical:15,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.panel},primaryButton:{backgroundColor:COLORS.mint,borderColor:COLORS.mint},buttonText:{fontSize:19,color:COLORS.fg,fontWeight:'800'},
 section:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},sectionHeading:{fontSize:16,fontWeight:'700',color:COLORS.fg},add:{fontSize:15,fontWeight:'700',color:COLORS.mint},
 presets:{gap:9,paddingBottom:5},preset:{backgroundColor:COLORS.panel,borderColor:COLORS.line,borderWidth:1,borderRadius:15,padding:12,minWidth:130,maxWidth:170},presetActive:{borderColor:COLORS.mint},presetName:{color:COLORS.fg,fontWeight:'700',fontSize:15},presetTime:{color:COLORS.fg,fontSize:22,fontWeight:'800',marginTop:7,fontVariant:['tabular-nums']},edit:{color:COLORS.muted,fontSize:12,textAlign:'right'},
 foot:{textAlign:'center',color:COLORS.muted,fontSize:12,marginTop:13},clockHint:{textAlign:'center',color:COLORS.muted,fontSize:17,marginBottom:20},
 overlay:{flex:1,backgroundColor:'rgba(0,0,0,.75)',justifyContent:'center',padding:22},modal:{padding:22,borderRadius:22,backgroundColor:COLORS.panel,maxWidth:520,width:'100%',alignSelf:'center'},modalTitle:{color:COLORS.fg,fontSize:24,fontWeight:'800',marginBottom:16},fieldLabel:{color:COLORS.muted,fontSize:15,marginBottom:8},input:{color:COLORS.fg,backgroundColor:COLORS.bg,borderColor:COLORS.line,borderWidth:1,borderRadius:12,fontSize:20,padding:12,marginBottom:13},modalButtons:{flexDirection:'row',gap:10,marginTop:10},settingRow:{flexDirection:'row',justifyContent:'space-between',marginVertical:14},note:{color:COLORS.muted,fontSize:13,lineHeight:20}
});
