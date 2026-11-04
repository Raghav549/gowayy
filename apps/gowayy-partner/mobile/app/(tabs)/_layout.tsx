import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

/**
 * Original partner navigation: a floating "pill rail" with a raised centre
 * action (go online / new listing), not a generic icon bar.
 */
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
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="home-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="notifications-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
      <Tabs.Screen name="manage" options={{ title: 'Manage', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="briefcase-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="wallet-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size, focused }) => <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" color={focused ? '#FFFFFF' : color as string} size={size} /></View> }} />
    </Tabs>
  );
}
