import React, {useEffect,useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {ClockPrice,readOwnerPrices,saveOwnerPrice} from './clockApi';
const C={fg:'#F7FAFF',panel:'#17263B',mint:'#80F4D6',muted:'#A7BAD1',line:'#35445E',danger:'#FF8E95'};
type Edit={units:string;enabled:boolean};
export function OwnerPricingPanel({userId}:{userId:string}){
 const [prices,setPrices]=useState<ClockPrice[]|null>(null);
 const [edits,setEdits]=useState<Record<string,Edit>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let live=true;
  readOwnerPrices().then(x=>{
   if(!live)return;
   setPrices(x.features);
   setEdits(Object.fromEntries(x.features.map(p=>[p.feature,{units:String(p.units),enabled:p.enabled}])));
  }).catch(()=>{if(live)setPrices(null)});
  return()=>{live=false};
 },[userId]);
 if(!prices)return null; // Backend Owner authorization is mandatory; no client-side bypass.
 const save=async(p:ClockPrice)=>{
  const value=edits[p.feature],units=Number(value?.units);
  if(!Number.isInteger(units)||units<0||units>30){setMessage('每項消耗請輸入 0～30 的整數');return;}
  setBusy(p.feature);setMessage('');
  try{
   const r=await saveOwnerPrice(p,units,value.enabled);
   setPrices(previous=>previous?.map(v=>v.feature===p.feature?r.price:v)||null);
   setMessage(p.label+'：設定已儲存並留下後端稽核紀錄。');
  }catch(e){setMessage((e as Error).message);}
  finally{setBusy(null);}
 };
 return <View style={s.panel}>
  <Text style={s.title}>🔋 Clock 超級管理員｜電池消耗設定</Text>
  <Text style={s.note}>只有經後端驗證的 Owner 能變更。設定 X 後仍須中央 Battery 任務及 Secret 驗證完成才會開放扣量。</Text>
  {prices.map(p=><View key={p.feature} style={s.item}>
   <Text style={s.label}>{p.label}</Text>
   <Text style={s.note}>{p.feature} · {p.available?'服務已就緒':'尚未開放扣量'}</Text>
   <View style={s.row}>
    <TextInput style={s.input} keyboardType="number-pad" value={edits[p.feature]?.units??String(p.units)}
      onChangeText={units=>setEdits(old=>({...old,[p.feature]:{...old[p.feature],units}}))}
      accessibilityLabel={p.label+'消耗顆數'}/>
    <Text style={s.note}>顆／次</Text>
    <Pressable style={s.btn} onPress={()=>setEdits(old=>({...old,[p.feature]:{...old[p.feature],enabled:!old[p.feature]?.enabled}}))}>
     <Text style={s.fg}>{edits[p.feature]?.enabled?'啟用':'停用'}</Text>
    </Pressable>
    <Pressable style={s.btn} disabled={!!busy} onPress={()=>void save(p)}><Text style={s.fg}>{busy===p.feature?'處理中':'儲存'}</Text></Pressable>
   </View>
  </View>)}
  {!!message&&<Text style={s.note}>{message}</Text>}
 </View>;
}
const s=StyleSheet.create({
 panel:{gap:12,padding:12,borderWidth:1,borderColor:C.mint,borderRadius:12,marginTop:18,backgroundColor:C.panel},
 title:{color:C.mint,fontSize:18,fontWeight:'800'},note:{color:C.muted,fontSize:12,lineHeight:18},
 item:{gap:5,paddingTop:8,borderTopWidth:1,borderColor:C.line},
 label:{color:C.fg,fontSize:14,fontWeight:'700'},row:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},
 input:{minWidth:50,padding:7,borderRadius:7,borderWidth:1,borderColor:C.line,color:C.fg},
 btn:{borderRadius:8,padding:9,backgroundColor:'#0B1220',borderWidth:1,borderColor:C.line},fg:{color:C.fg}
});
