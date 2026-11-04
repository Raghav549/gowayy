import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

/** Explore navigation: segmented discovery rail — Discover / Hidden gems / Search / Saved. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { position: 'absolute', left: 13, right: 13, bottom: 9, height: 72, paddingTop: 8, paddingBottom: 8, borderTopWidth: 0, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.96)', elevation: 12, shadowColor: '#43275E', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}
    >
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="compass-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
      <Tabs.Screen name="gems" options={{ title: 'Hidden gems', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="diamond-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="search-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="bookmark-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
    </Tabs>
  );
}
