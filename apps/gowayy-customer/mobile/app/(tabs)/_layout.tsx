import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GSymbol } from '../../src/components/UI';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size, focused }: { name: IconName; color: unknown; size: number; focused: boolean }) {
  return <View style={{ minWidth: 54, height: 28, borderRadius: 15, backgroundColor: focused ? '#17131B' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={name} color={focused ? '#FFFFFF' : color as string} size={size} /></View>;
}

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        tabBarStyle: { position: 'absolute', left: 13, right: 13, bottom: 9, height: 72, paddingTop: 8, paddingBottom: 8, borderTopWidth: 0, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.96)', elevation: 12, shadowColor: '#43275E', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerLeft: () => <GSymbol size={28} />,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'GOWAYY', tabBarLabel: 'Home', tabBarIcon: ({ color, size, focused }) => <TabIcon name="home-outline" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ color, size, focused }) => <TabIcon name="compass-outline" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ color, size, focused }) => <TabIcon name="ticket-outline" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size, focused }) => <TabIcon name="receipt-outline" color={color} size={size} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size, focused }) => <TabIcon name="person-outline" color={color} size={size} focused={focused} /> }} />
    </Tabs>
  );
}
