import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '../src/store';
import { colors, font, radius, spacing } from '../src/theme';

const SCENES=[
  {title:'Grow your business',body:'One partner workspace for rides, deliveries, food, groceries, welcoming stays and local tours.',icon:'storefront-outline' as const,color:'#7A5A98',label:'ONE PARTNER WORKSPACE'},
  {title:'Verified, on your terms',body:'Upload documents once. See the review status clearly before you accept live work.',icon:'shield-checkmark-outline' as const,color:'#668B75',label:'CLEAR VERIFICATION'},
  {title:'Know every settlement',body:'Follow requests, captured payments and transparent partner earnings in one place.',icon:'wallet-outline' as const,color:'#C28A48',label:'ORDERS · EARNINGS · PAYOUTS'},
];
export default function Index(){
  const router=useRouter();const user=useSession(s=>s.user);const{width}=useWindowDimensions();const[phase,setPhase]=useState<'splash'|'onboarding'|'done'>('splash');const[scene,setScene]=useState(0);const[reduced,setReduced]=useState(false);const reveal=useRef(new Animated.Value(0)).current;const accentReveal=useRef(new Animated.Value(0)).current;const wordReveal=useRef(new Animated.Value(0)).current;
  useEffect(()=>{let alive=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduced(v)}).catch(()=>undefined);return()=>{alive=false}},[]);
  useEffect(()=>{if(phase!=='splash')return;reveal.setValue(0);accentReveal.setValue(0);wordReveal.setValue(0);Animated.timing(reveal,{toValue:1,duration:reduced?1:650,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();const accentTimer=setTimeout(()=>Animated.timing(accentReveal,{toValue:1,duration:reduced?1:580,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(),reduced?0:260);const wordTimer=setTimeout(()=>Animated.timing(wordReveal,{toValue:1,duration:reduced?1:600,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(),reduced?0:420);const timer=setTimeout(()=>setPhase(user?'done':'onboarding'),reduced?180:1480);return()=>{clearTimeout(accentTimer);clearTimeout(wordTimer);clearTimeout(timer)}},[phase,reduced,reveal,accentReveal,wordReveal,user]);
  const advance=()=>scene<SCENES.length-1?setScene(scene+1):setPhase('done');
  if(phase==='splash'){
    const size=Math.min(width*.52,236);const lift=(v:Animated.Value)=>v.interpolate({inputRange:[0,1],outputRange:[8,0]});
    return <Pressable onPress={()=>setPhase(user?'done':'onboarding')} accessibilityRole="button" accessibilityLabel="Skip GOWAYY Partner splash" style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center',gap:6}}>
      <View style={{width:size,height:size}}>
        <Animated.View style={{position:'absolute',left:0,top:0,right:0,bottom:0,opacity:reveal,transform:[{translateY:lift(reveal)}]}}><Image source={require('../assets/branding/g-purple.png')} style={{width:'100%',height:'100%'}} contentFit="contain" accessibilityLabel=""/></Animated.View>
        <Animated.View style={{position:'absolute',left:0,top:0,right:0,bottom:0,opacity:accentReveal,transform:[{translateY:lift(accentReveal)}]}}><Image source={require('../assets/branding/g-orange.png')} style={{width:'100%',height:'100%'}} contentFit="contain" accessibilityLabel=""/></Animated.View>
      </View>
      <Animated.Text accessibilityLiveRegion="polite" style={{opacity:wordReveal,transform:[{translateY:lift(wordReveal)}],color:'#17131B',fontSize:28,lineHeight:34,fontWeight:'800',letterSpacing:2.1}}>GOWAYY PARTNER</Animated.Text>
    </Pressable>;
  }
  if(phase==='onboarding'){
    const s=SCENES[scene];return <View style={{flex:1,backgroundColor:colors.bg,padding:spacing.xl,justifyContent:'space-between'}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><View style={{flexDirection:'row',alignItems:'center',gap:9}}><Image source={require('../assets/branding/g-symbol.png')} style={{width:30,height:30}} contentFit="contain" accessibilityLabel=""/><Text style={{color:colors.accent,fontWeight:'800',letterSpacing:1.2}}>GOWAYY PARTNER</Text></View><Pressable onPress={()=>setPhase('done')} accessibilityRole="button"><Text style={{color:colors.textMuted}}>Skip</Text></Pressable></View>
      <View style={{alignItems:'center',gap:spacing.lg}}>
        <View style={{width:Math.min(width-48,420),height:270,borderRadius:34,backgroundColor:'#EEE5F7',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
          <View style={{position:'absolute',width:220,height:220,borderRadius:110,backgroundColor:'rgba(255,255,255,.42)',right:-110,top:-98}}/><View style={{position:'absolute',width:170,height:170,borderRadius:85,backgroundColor:'rgba(255,255,255,.3)',left:-90,bottom:-95}}/>
          <View style={{width:122,height:122,borderRadius:36,backgroundColor:'rgba(255,255,255,.92)',alignItems:'center',justifyContent:'center',elevation:9,shadowColor:'#4D3562',shadowOpacity:.12,shadowRadius:20,shadowOffset:{width:0,height:9},transform:[{rotate:'4deg'}]}}><Ionicons name={s.icon} size={60} color={s.color}/></View>
          <View style={{position:'absolute',left:20,bottom:18,flexDirection:'row',gap:7,alignItems:'center',paddingHorizontal:12,paddingVertical:8,borderRadius:99,backgroundColor:'rgba(255,255,255,.87)'}}><Ionicons name="checkmark-circle-outline" size={14} color="#70439A"/><Text style={{fontSize:10,fontWeight:'800',letterSpacing:.6,color:'#574669'}}>{s.label}</Text></View>
        </View>
        <Text style={{fontSize:font.sizes['2xl'],fontWeight:font.display,color:colors.text,textAlign:'center'}}>{s.title}</Text><Text style={{color:colors.textMuted,textAlign:'center',lineHeight:23,maxWidth:430}}>{s.body}</Text>
      </View>
      <View style={{gap:spacing.md}}><View style={{flexDirection:'row',justifyContent:'center',gap:spacing.sm}}>{SCENES.map((_,i)=><View key={i} style={{width:i===scene?24:8,height:8,borderRadius:radius.pill,backgroundColor:i===scene?colors.accent:'#D9CBE5'}}/>)}</View>
        <View style={{flexDirection:'row',gap:12}}><Pressable onPress={()=>setPhase('done')} style={{flex:1,borderRadius:radius.pill,padding:spacing.lg,alignItems:'center',backgroundColor:'#F0E8F6'}}><Text style={{color:colors.text,fontWeight:'600'}}>Skip</Text></Pressable><Pressable onPress={advance} style={{flex:1,borderRadius:radius.pill,padding:spacing.lg,alignItems:'center',backgroundColor:'#111014'}}><Text style={{color:'#FFF',fontWeight:'700'}}>{scene<SCENES.length-1?'Continue':'Get started'}</Text></Pressable></View>
      </View>
    </View>;
  }
  if(user){router.replace('/(tabs)/home');return null;}router.replace('/auth/login');return null;
}
