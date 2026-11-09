import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,Share,StyleSheet,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {loadMember,officialStarryClient} from '../src/auth/session';
import {OwnerPricingPanel} from '../src/auth/OwnerPricingPanel';
import type {LatestHandoff} from '../src/auth/starry-client';

export const CLOCK_HANDOFF_VERSION='2026-11-09.6';
// This is Clock's local /admin route. Starry ID's admin resources are never modified.
export default function ClockAdmin(){
 const router=useRouter();
 const [ownerId,setOwnerId]=useState<string|null>(null);
 const [checked,setChecked]=useState(false);
 const [handoff,setHandoff]=useState<LatestHandoff|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  void (async()=>{
   try{
    const me=await loadMember();
    if(!alive)return;
    if(me?.staff_role!=='owner'){
     setError('此頁僅限 Starry ID 超級管理員');
     setChecked(true);return;
    }
    setOwnerId(me.user_id);
    try{
     const info=await officialStarryClient().getLatestHandoff(CLOCK_HANDOFF_VERSION);
     if(alive)setHandoff(info);
    }catch(e){if(alive)setError('目前無法取得中央最新串接指令');}
   }catch{if(alive)setError('目前無法確認管理員身分');}
   finally{if(alive)setChecked(true);}
  })();
  return()=>{alive=false};
 },[]);
 async function copyHandoff(){
  if(!handoff?.text)return;
  // Share sheet includes the system's Copy action on supported devices;
  // the entire instruction stays inside the OS sharing flow.
  await Share.share({message:handoff.text,title:'複製最新串接指令'});
 }
 return <ScrollView style={s.page} contentContainerStyle={s.content}>
  <Pressable style={s.button} onPress={()=>router.back()}><Text style={s.btnText}>返回 Clock</Text></Pressable>
  {!checked?<ActivityIndicator color="#80F4D6"/>:ownerId?<React.Fragment>
    <View style={s.card}>
      <Text style={s.title}>串接指令</Text>
      <Text style={s.text}>目前採用版本：{CLOCK_HANDOFF_VERSION}</Text>
      <Text style={s.text}>中央最新版本：{handoff?.version??'尚未取得'}</Text>
      <Text style={s.text}>{handoff?(handoff.up_to_date?'已是最新':'有新版'):error}</Text>
      <Text style={s.text}>更新時請 AI 只補差異，不要整份重做</Text>
      {handoff&&!handoff.up_to_date?<Pressable style={s.button} onPress={()=>{void copyHandoff().catch(()=>setError('無法開啟系統分享選單'))}}>
       <Text style={s.btnText}>複製最新串接指令</Text>
      </Pressable>:null}
    </View>
    <OwnerPricingPanel userId={ownerId}/>
   </React.Fragment>:<Text style={s.text}>{error}</Text>}
 </ScrollView>;
}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:'#0B1220'},content:{padding:20,gap:14},
 card:{padding:16,backgroundColor:'#17263B',borderColor:'#35445E',borderWidth:1,borderRadius:14,gap:10},
 title:{color:'#F7FAFF',fontWeight:'800',fontSize:21},
 text:{color:'#F7FAFF',fontSize:15},
 button:{borderWidth:1,borderColor:'#80F4D6',padding:12,borderRadius:10,marginVertical:4},
 btnText:{color:'#80F4D6',textAlign:'center',fontWeight:'700'}
});
