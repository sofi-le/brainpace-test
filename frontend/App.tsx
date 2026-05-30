/**
 * BrainPace — App.tsx
 *
 * Setup:
 *   npx create-expo-app brainpace --template blank-typescript
 *   npx expo install react-native-svg
 *   npx expo install @react-navigation/native @react-navigation/bottom-tabs
 *   npx expo install react-native-screens react-native-safe-area-context
 *   npx expo install @expo-google-fonts/inter expo-font
 */

import React from 'react';
import { StatusBar, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

import HomeScreen from './src/screens/HomeScreen';
import LiveScreen from './src/screens/LiveScreen';
import StudyScreen from './src/screens/StudyScreen';
import CoachScreen from './src/screens/CoachScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

function Placeholder({ title }: { title: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>{title}</Text>
    </View>
  );
}
const YouScreen = () => <Placeholder title="You" />;

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = { Home: '⌂', Latest: '◎', Report: '⊞', Coach: '✦', You: '○' };
  const tint = focused ? colors.purp : colors.ts;
  return (
    <View style={{ alignItems: 'center', width: 60 }}>
      {focused && <View style={styles.activePill} />}
      <Text style={[styles.iconText, { color: tint, marginTop: focused ? 0 : 6 }]}>{icons[label] || '•'}</Text>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: colors.purp,
            tabBarInactiveTintColor: colors.ts,
            tabBarLabelStyle: styles.tabLabel,
            tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
          })}
        >
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Latest" component={LiveScreen} />
          <Tab.Screen name="Report" component={StudyScreen} />
          <Tab.Screen name="Coach" component={CoachScreen} />
          <Tab.Screen name="You" component={YouScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg2,
    borderTopColor: colors.bg3,
    borderTopWidth: 1,
    height: 82,
    paddingBottom: 20,
    paddingTop: 8,
  },
  tabLabel: { fontSize: 9, fontWeight: '600', marginTop: 4 },
  activePill: {
    width: 48, height: 4, borderRadius: 2,
    backgroundColor: colors.purp, marginBottom: 6,
    shadowColor: colors.purp, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  iconText: { fontSize: 16 },
  placeholder: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.ts, fontSize: 16, fontWeight: '600' },
});
