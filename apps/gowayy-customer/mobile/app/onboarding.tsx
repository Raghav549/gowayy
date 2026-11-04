import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useUI } from '../src/store/useUI';
import { useTheme, spacing, radius, font } from '../src/theme';

const SLIDES = [
  { eyebrow:'01 / MARKET', title:'Fresh finds, right to your door.', body:'Market-fresh produce and everyday essentials, all in one easy basket.', icon:'basket-outline' as const },
  { eyebrow:'02 / MOVE', title:'A smoother way to get there.', body:'Find a local ride for the next stop, with plans connected to your journey.', icon:'car-sport-outline' as const },
  { eyebrow:'03 / STAY', title:'Settle into somewhere lovely.', body:'Discover welcoming stays, thoughtful details and space to slow down.', icon:'bed-outline' as const },
  { eyebrow:'04 / EXPLORE', title:'Find places worth the trip.', body:'Real destinations, local guides and tucked-away Himalayan corners.', icon:'compass-outline' as const },
  { eyebrow:'05 / EXPERIENCE', title:'Make room for the local story.', body:'Meet the people, tastes and experiences that make a place your own.', icon:'cafe-outline' as const },
];
const SCENE_IMAGES = [
  require('../assets/onboarding/groceries.webp'),
  require('../assets/onboarding/local-cab.webp'),
  require('../assets/onboarding/hotel-stay.webp'),
  require('../assets/onboarding/himalayan-discovery.webp'),
  require('../assets/onboarding/local-experience.webp'),
];
const ANIMATED_SCENE_IMAGES = [
  require('../assets/onboarding/groceries-animated.webp'),
  require('../assets/onboarding/local-cab-animated.webp'),
  require('../assets/onboarding/hotel-stay-animated.webp'),
  require('../assets/onboarding/himalayan-discovery-animated.webp'),
  require('../assets/onboarding/local-experience-animated.webp'),
];

function Scene({ index, reduced }: { index:number; reduced:boolean }) {
  const t=useSharedValue(0);
  useEffect(()=>{
    if(reduced){t.value=.5;return;}
    t.value=withRepeat(withTiming(1,{duration:3200,easing:Easing.inOut(Easing.quad)}),-1,true);
    return()=>cancelAnimation(t);
  },[reduced,t]);
  const float=useAnimatedStyle(()=>({transform:[{translateY:interpolate(t.value,[0,1],[2,-3])}]}));
  const glow=useAnimatedStyle(()=>({opacity:interpolate(t.value,[0,1],[.72,1])}));
  return <View style={styles.scene}>
    <Animated.View style={[styles.sceneArtwork,float]}>
      <Image source={reduced?SCENE_IMAGES[index]:ANIMATED_SCENE_IMAGES[index]} style={styles.sceneImage} contentFit="contain" autoplay={!reduced} accessibilityLabel={SLIDES[index].body} />
    </Animated.View>
    <View pointerEvents="none" style={styles.orbTop}/><View pointerEvents="none" style={styles.orbBottom}/>
    <Animated.View style={[styles.sceneChip,glow]}><Ionicons name={SLIDES[index].icon} size={13} color="#421080"/><Text style={styles.sceneChipText}>{SLIDES[index].eyebrow.split('/ ')[1]}</Text></Animated.View>
  </View>;
}
export default function Onboarding(){
  const router=useRouter();const{width,height}=useWindowDimensions();const{c}=useTheme();const reduced=useUI(s=>s.reducedMotion);const setOnboarded=useUI(s=>s.setOnboarded);const[index,setIndex]=useState(0);const slide=SLIDES[index];
  const finish=useCallback(()=>{setOnboarded(true);router.replace('/auth/login');},[setOnboarded,router]);
  const next=useCallback(()=>{if(index===SLIDES.length-1)finish();else setIndex(index+1);},[index,finish]);
  const previous=useCallback(()=>setIndex(i=>Math.max(0,i-1)),[]);
  const gesture=Gesture.Pan().activeOffsetX([-24,24]).onEnd(e=>{if(e.translationX < -50)next();else if(e.translationX>50)previous();}).runOnJS(true);
  return <GestureDetector gesture={gesture}><View style={[styles.root,{backgroundColor:c.bg}]}>
    <View style={styles.top}><View style={styles.brand}><Image source={require('../assets/branding/g-symbol.png')} style={styles.brandSymbol} contentFit="contain" accessibilityLabel=""/><Text style={styles.brandText}>GOWAYY</Text></View><Pressable onPress={finish} accessibilityRole="button"><Text style={[styles.skip,{color:c.textMuted}]}>Skip</Text></Pressable></View>
    <View style={[styles.art,{width:Math.min(width-spacing.xl*2,460),height:Math.min(290,height*.37)}]}><Scene key={index} index={index} reduced={reduced}/></View>
    <View style={styles.copy}><Text style={[styles.eyebrow,{color:c.accent}]}>{slide.eyebrow}</Text><Text style={[styles.title,{color:c.text}]}>{slide.title}</Text><Text style={[styles.body,{color:c.textMuted}]}>{slide.body}</Text></View>
    <View style={styles.bottom}><View style={styles.dots} accessibilityRole="tablist">{SLIDES.map((item,i)=><Pressable key={item.eyebrow} onPress={()=>setIndex(i)} accessibilityRole="tab" accessibilityState={{selected:i===index}} hitSlop={8}><View style={[styles.dotIndicator,{width:i===index?24:7,backgroundColor:i===index?'#421080':'#D9CBE5'}]}/></Pressable>)}</View>
      <View style={styles.controls}><Pressable onPress={previous} disabled={index===0} accessibilityRole="button" accessibilityLabel="Previous slide" style={[styles.back,{borderColor:c.border,opacity:index===0?.42:1}]}><Ionicons name="arrow-back" size={18} color={c.text}/></Pressable><Pressable onPress={next} accessibilityRole="button" accessibilityLabel="Next slide" style={styles.next}><Text style={styles.nextText}>{index===SLIDES.length-1?'Get started':'Continue'}</Text><Ionicons name="arrow-forward" size={17} color="#FFF"/></Pressable></View>
    </View>
  </View></GestureDetector>;
}
const styles=StyleSheet.create({
  root:{flex:1,padding:spacing.xl,justifyContent:'space-between'},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  brand:{flexDirection:'row',alignItems:'center',gap:9},
  brandSymbol:{width:32,height:32},
  brandText:{fontSize:14,fontWeight:'800',letterSpacing:1.3,color:'#21172B'},
  skip:{fontSize:14,paddingVertical:spacing.xs},
  art:{alignSelf:'center'},
  scene:{flex:1,borderRadius:34,overflow:'hidden',backgroundColor:'#EEE5F7',alignItems:'center',justifyContent:'center'},
  sceneArtwork:{...StyleSheet.absoluteFill,borderRadius:34,overflow:'hidden'},
  sceneImage:{width:'100%',height:'100%'},
  orbTop:{position:'absolute',width:190,height:190,borderRadius:95,backgroundColor:'rgba(255,255,255,.15)',right:-104,top:-116},
  orbBottom:{position:'absolute',width:145,height:145,borderRadius:75,backgroundColor:'rgba(255,255,255,.18)',left:-90,bottom:-98},
  sceneChip:{position:'absolute',left:15,bottom:15,flexDirection:'row',alignItems:'center',gap:7,borderRadius:999,paddingHorizontal:12,paddingVertical:8,backgroundColor:'rgba(255,255,255,.9)'},
  sceneChipText:{fontSize:10,fontWeight:'800',letterSpacing:.8,color:'#43334F'},
  copy:{gap:8,minHeight:145},
  eyebrow:{fontSize:11,letterSpacing:1.7,fontWeight:'800'},
  title:{fontSize:font.sizes['2xl'],fontWeight:'800',letterSpacing:-.6,lineHeight:36},
  body:{fontSize:font.sizes.base,lineHeight:23},
  bottom:{gap:20},dots:{flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},
  dotIndicator:{height:7,borderRadius:4},controls:{flexDirection:'row',gap:12},
  back:{width:54,height:52,borderRadius:26,borderWidth:1,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.75)'},
  next:{flex:1,height:52,borderRadius:26,backgroundColor:'#111014',alignItems:'center',justifyContent:'center',flexDirection:'row',gap:9},
  nextText:{color:'#FFF',fontWeight:'700',fontSize:15},
});
