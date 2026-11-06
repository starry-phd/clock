import {useEffect, useState} from 'react';
import {View, Text, Pressable, StyleSheet, Platform} from 'react-native';
import {router} from 'expo-router';
import {finishWebRelay} from '../../src/auth/session';
export default function RelayDone(){
 const [message,setMessage]=useState('驗證 Starry ID 登入中…');
 useEffect(()=>{
  if(Platform.OS!=='web'){router.replace('/');return;}
  finishWebRelay().then(r=>{
   setMessage(r.message);
   if(r.ok)router.replace('/');
  }).catch(()=>setMessage('登入驗證失敗，請重新操作'));
 },[]);
 return <View style={s.page}><Text style={s.text}>{message}</Text><Pressable onPress={()=>router.replace('/')}><Text style={s.link}>返回 Clock</Text></Pressable></View>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#0B1220',justifyContent:'center',alignItems:'center',padding:24},text:{color:'#F7FAFF',fontSize:18,marginBottom:25},link:{color:'#80F4D6',fontSize:18}});
