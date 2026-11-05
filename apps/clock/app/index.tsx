import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, useWindowDimensions, View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import {
  ClockPreset, DEFAULT_PRESETS, formatCountdown, formatLocalClock,
  newTimer, pauseTimer, sanitizePresets, startTimer, tickTimer, TimerSnapshot
} from '@clock/core';
import {readAppConfig} from '@clock/auth-contract';

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
  const [memberStatus,setMemberStatus]=useState('檢查中…');
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
    let live=true;
    readAppConfig().then(result=>{if(live)setMemberStatus(result.kind==='active'?'中央 App 已登記':result.message)}).catch(()=>{if(live)setMemberStatus('中央會員暫時無法連線')});
    return()=>{live=false};
  },[]);
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
      }
    });
    return()=>{clearInterval(t);s.remove()};
  },[play,setTimerSync]);

  const choose=useCallback((p:ClockPreset)=>{setSelectedId(p.id);setTimerSync(newTimer(p.durationSeconds));},[setTimerSync]);
  const toggle=useCallback(()=>{
    const cur=timerRef.current;
    setTimerSync(cur.status==='running'?pauseTimer(cur,Date.now()):startTimer(cur,Date.now()));
  },[setTimerSync]);
  const reset=useCallback(()=>{const p=presets.find(x=>x.id===selectedId)||presets[0];setTimerSync(newTimer(p.durationSeconds));},[presets,selectedId,setTimerSync]);
  const saveEditor=useCallback(()=>{
    if(!editor)return;
    const name=editor.name.trim(); const m=Number(editor.minutes);const s=Number(editor.seconds);
    if(!name||name.length>24||!Number.isInteger(m)||!Number.isInteger(s)||m<0||m>1439||s<0||s>59||(m===0&&s===0)){
      Alert.alert('請檢查設定','名稱 1～24 字，時間需介於 00:01 與 1439:59。');return;
    }
    const id=editor.id||`custom-${Date.now()}`;
    const next={id,name,durationSeconds:m*60+s};
    const updated=editor.id?presets.map(p=>p.id===id?next:p):[...presets,next];
    if(updated.length>50){Alert.alert('已達上限','最多儲存 50 組用途。');return;}
    setPresets(updated);choose(next);setEditor(null);
  },[editor,presets,choose]);
  const remove=useCallback(()=>{
    if(!editor?.id||presets.length===1)return;
    const updated=presets.filter(p=>p.id!==editor.id);
    setPresets(updated);if(selectedId===editor.id)choose(updated[0]);setEditor(null);
  },[editor,presets,selectedId,choose]);
  const saveSettings=()=>{
    const n=Number(settingSeconds);
    if(!Number.isInteger(n)||n<0||n>120){Alert.alert('提醒秒數','請輸入 0～120 秒。0 表示只在歸零時響鈴。');return;}
    setAlertSeconds(n);setSettings(false);
  };
  const compact=height<650;
  const digitSize=Math.min(width*.218,height*(compact?.24:.25),250);
  const display=mode==='clock'?formatLocalClock(new Date(now)):formatCountdown(timer.remainingMs/1000);
  const selected=presets.find(x=>x.id===selectedId)||presets[0];

  return <View style={styles.screen}>
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
      <Text style={styles.fieldLabel}>名稱</Text>
      <TextInput value={editor?.name||''} onChangeText={name=>setEditor(e=>e?{...e,name}:e)} maxLength={24} placeholder="例如：休息時間" placeholderTextColor={COLORS.muted} style={styles.input}/>
      <Text style={styles.fieldLabel}>倒數長度</Text>
      <View style={{flexDirection:'row',gap:10,alignItems:'center'}}><TextInput value={editor?.minutes||''} onChangeText={minutes=>setEditor(e=>e?{...e,minutes}:e)} keyboardType="number-pad" style={[styles.input,{flex:1}]} /><Text style={styles.fieldLabel}>分</Text><TextInput value={editor?.seconds||''} onChangeText={seconds=>setEditor(e=>e?{...e,seconds}:e)} keyboardType="number-pad" style={[styles.input,{flex:1}]} /><Text style={styles.fieldLabel}>秒</Text></View>
      <View style={styles.modalButtons}><Button label="取消" onPress={()=>setEditor(null)}/><Button label="儲存" primary onPress={saveEditor}/></View>
      {!!editor?.id&&presets.length>1&&<Pressable onPress={remove}><Text style={[styles.add,{color:COLORS.danger,textAlign:'center',marginTop:18}]}>刪除此用途</Text></Pressable>}
    </View></KeyboardAvoidingView></Modal>

    <Modal transparent visible={settings} animationType="fade" onRequestClose={()=>setSettings(false)}><View style={styles.overlay}><View style={styles.modal}>
      <Text style={styles.modalTitle}>計時器設定</Text>
      <Text style={styles.fieldLabel}>提前響鈴（秒）</Text>
      <TextInput value={settingSeconds} onChangeText={setSettingSeconds} keyboardType="number-pad" style={styles.input} />
      <Text style={styles.fieldLabel}>允許 0～120 秒，倒數歸零也會響鈴。</Text>
      <Pressable style={styles.settingRow} onPress={()=>setMuted(v=>!v)}><Text style={styles.fieldLabel}>提醒音效</Text><Text style={styles.add}>{muted?'已靜音 · 點擊開啟':'已開啟 · 點擊靜音'}</Text></Pressable>
      <Text style={styles.note}>計時器在畫面開啟時運作最穩定。手機鎖屏或系統終止 App 時，不保證準時響鈴。</Text>
      <Text style={styles.fieldLabel}>Starry ID 中央會員：{memberStatus}</Text>
      <Pressable accessibilityRole="link" onPress={()=>Linking.openURL('https://id.starry.phd/account').catch(()=>{})}>
        <Text style={styles.add}>開啟 Starry ID 帳號中心</Text>
      </Pressable>
      <Text style={styles.note}>clock 尚須在中央 App Registry 登記後才能啟用本 App 內的官方登入；倒數功能不需登入。</Text>
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
