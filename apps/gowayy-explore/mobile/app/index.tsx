import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors, font, radius, spacing } from '../src/theme';

const SCENES = [
  { title:'Discover the Himalaya', body:'Explore Darjeeling, Kalimpong, Kurseong, Mirik and verified hidden gems.', icon:'compass-outline' as const, accent:'#7C9E76', detail:'FIVE HIMALAYAN REGIONS' },
  { title:'Hidden gems, verified', body:'Useful coordinates, access, seasonality and safety notes — places checked before they are shared.', icon:'map-outline' as const, accent:'#8D70A8', detail:'ROUTES · SEASON · SAFETY' },
  { title:'Carry your plans with you', body:'Save places and hand off stays, rides and local experiences to GOWAYY with your journey intact.', icon:'bookmark-outline' as const, accent:'#D08F48', detail:'SAVED TO YOUR JOURNEY' },
];
export default function Index(){
  const router=useRouter();const{width}=useWindowDimensions();const[phase,setPhase]=useState<'splash'|'onboarding'|'done'>('splash');const[scene,setScene]=useState(0);const[reduced,setReduced]=useState(false);const reveal=useRef(new Animated.Value(0)).current;const accentReveal=useRef(new Animated.Value(0)).current;const wordReveal=useRef(new Animated.Value(0)).current;
  useEffect(()=>{let alive=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduced(v)}).catch(()=>undefined);return()=>{alive=false}},[]);
  useEffect(()=>{if(phase!=='splash')return;reveal.setValue(0);accentReveal.setValue(0);wordReveal.setValue(0);Animated.timing(reveal,{toValue:1,duration:reduced?1:650,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();const accentTimer=setTimeout(()=>Animated.timing(accentReveal,{toValue:1,duration:reduced?1:580,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(),reduced?0:260);const wordTimer=setTimeout(()=>Animated.timing(wordReveal,{toValue:1,duration:reduced?1:600,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(),reduced?0:420);const timer=setTimeout(()=>setPhase('onboarding'),reduced?180:1480);return()=>{clearTimeout(accentTimer);clearTimeout(wordTimer);clearTimeout(timer)}},[phase,reduced,reveal,accentReveal,wordReveal]);
  const advance=()=>scene<SCENES.length-1?setScene(scene+1):setPhase('done');
  if(phase==='splash'){
    const size=Math.min(width*.52,236);const lift=(v:Animated.Value)=>v.interpolate({inputRange:[0,1],outputRange:[8,0]});
    return <Pressable onPress={()=>setPhase('onboarding')} accessibilityRole="button" accessibilityLabel="Skip GOWAYY Explore splash" style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center',gap:6}}>
      <View style={{width:size,height:size}}>
        <Animated.View style={{position:'absolute',left:0,top:0,right:0,bottom:0,opacity:reveal,transform:[{translateY:lift(reveal)}]}}><Image source={require('../assets/branding/g-purple.png')} style={{width:'100%',height:'100%'}} contentFit="contain" accessibilityLabel=""/></Animated.View>
        <Animated.View style={{position:'absolute',left:0,top:0,right:0,bottom:0,opacity:accentReveal,transform:[{translateY:lift(accentReveal)}]}}><Image source={require('../assets/branding/g-orange.png')} style={{width:'100%',height:'100%'}} contentFit="contain" accessibilityLabel=""/></Animated.View>
      </View>
      <Animated.Text accessibilityLiveRegion="polite" style={{opacity:wordReveal,transform:[{translateY:lift(wordReveal)}],color:'#17131B',fontSize:28,lineHeight:34,fontWeight:'800',letterSpacing:2.1}}>GOWAYY EXPLORE</Animated.Text>
    </Pressable>;
  }
  if(phase==='onboarding'){
    const s=SCENES[scene];return <View style={{flex:1,backgroundColor:colors.bg,padding:spacing.xl,justifyContent:'space-between'}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><View style={{flexDirection:'row',alignItems:'center',gap:9}}><Image source={require('../assets/branding/g-symbol.png')} style={{width:30,height:30}} contentFit="contain" accessibilityLabel=""/><Text style={{color:colors.accent,fontWeight:'800',letterSpacing:1.4}}>GOWAYY EXPLORE</Text></View><Pressable onPress={()=>setPhase('done')} accessibilityRole="button"><Text style={{color:colors.textMuted}}>Skip</Text></Pressable></View>
      <View style={{alignItems:'center',gap:spacing.lg}}>
        <View style={{width:Math.min(width-48,420),height:270,borderRadius:34,backgroundColor:'#EEE5F7',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
          <View style={{position:'absolute',width:230,height:230,borderRadius:115,backgroundColor:'rgba(255,255,255,.42)',top:-118,right:-66}}/><View style={{position:'absolute',width:180,height:180,borderRadius:90,backgroundColor:'rgba(255,255,255,.28)',left:-88,bottom:-102}}/>
          <View style={{width:122,height:122,borderRadius:36,backgroundColor:'rgba(255,255,255,.9)',alignItems:'center',justifyContent:'center',elevation:9,shadowColor:'#4D3562',shadowOpacity:.13,shadowRadius:20,shadowOffset:{width:0,height:9},transform:[{rotate:'-5deg'}]}}><Ionicons name={s.icon} size={62} color={s.accent}/></View>
          <View style={{position:'absolute',left:22,bottom:20,paddingHorizontal:13,paddingVertical:8,borderRadius:99,backgroundColor:'rgba(255,255,255,.86)',flexDirection:'row',alignItems:'center',gap:7}}><Ionicons name="sparkles-outline" size={14} color="#70439A"/><Text style={{fontSize:10,fontWeight:'800',letterSpacing:.7,color:'#574669'}}>{s.detail}</Text></View>
        </View>
        <Text style={{fontSize:font.sizes['2xl'],fontWeight:font.display,color:colors.text,textAlign:'center'}}>{s.title}</Text><Text style={{color:colors.textMuted,textAlign:'center',lineHeight:23,maxWidth:430}}>{s.body}</Text>
      </View>
      <View style={{gap:spacing.md}}><View style={{flexDirection:'row',justifyContent:'center',gap:spacing.sm}}>{SCENES.map((_,i)=><View key={i} style={{width:i===scene?24:8,height:8,borderRadius:radius.pill,backgroundColor:i===scene?colors.accent:'#D9CBE5'}}/>)}</View>
        <View style={{flexDirection:'row',gap:12}}><Pressable onPress={()=>setPhase('done')} style={{flex:1,borderRadius:radius.pill,padding:spacing.lg,alignItems:'center',backgroundColor:'#F0E8F6'}}><Text style={{color:colors.text,fontWeight:'600'}}>Skip</Text></Pressable><Pressable onPress={advance} style={{flex:1,borderRadius:radius.pill,padding:spacing.lg,alignItems:'center',backgroundColor:'#111014'}}><Text style={{color:'#FFF',fontWeight:'700'}}>{scene<SCENES.length-1?'Continue':'Start exploring'}</Text></Pressable></View>
      </View>
    </View>;
  }
  router.replace('/(tabs)/discover');return null;
}
