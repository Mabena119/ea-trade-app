import { Tabs } from "expo-router";
import { Home, Wallet, Activity } from "lucide-react-native";
import React from "react";
import { useApp } from "@/providers/app-provider";
import { useTheme } from "@/providers/theme-provider";
import { Platform, View, StyleSheet } from "react-native";
import { BlurView } from 'expo-blur';
import colors from "@/constants/colors";

export default function TabLayout() {
  const { isFirstTime } = useApp();
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isFirstTime ? {
          display: 'none',
        } : {
          position: 'absolute',
          bottom: 16,
          left: 16,
          right: 16,
          height: 72,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.colors.navBackground,
          borderRadius: 36,
          borderWidth: 0,
          paddingBottom: 8,
          paddingTop: 8,
          paddingHorizontal: 16,
          shadowColor: '#000000',
          shadowOffset: {
            width: 0,
            height: 16,
          },
          shadowOpacity: 0.4,
          shadowRadius: 32,
          elevation: 20,
          overflow: 'hidden',
        },
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={100}
              tint="dark"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 36,
                overflow: 'hidden',
                backgroundColor: theme.colors.navBackground,
              }}
            />
          ) : (
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 36,
              backgroundColor: theme.colors.navBackground,
            }} />
          )
        ),
        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.navInactiveColor,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: -1,
          letterSpacing: 0.1,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer,
              focused && {
                backgroundColor: `${theme.colors.accent}33`,
                borderWidth: 2,
                borderColor: `${theme.colors.accent}80`,
                shadowColor: theme.colors.accent,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.5,
                shadowRadius: 12,
                elevation: 10,
              }
            ]}>
              <Home
                color={focused ? theme.colors.textPrimary : theme.colors.navInactiveColor}
                size={25}
                strokeWidth={focused ? 2.8 : 2.2}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          title: "Quotes",
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer,
              focused && {
                backgroundColor: `${theme.colors.accent}33`,
                borderWidth: 2,
                borderColor: `${theme.colors.accent}80`,
                shadowColor: theme.colors.accent,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.5,
                shadowRadius: 12,
                elevation: 10,
              }
            ]}>
              <Activity
                color={focused ? theme.colors.textPrimary : theme.colors.navInactiveColor}
                size={25}
                strokeWidth={focused ? 2.8 : 2.2}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="metatrader"
        options={{
          title: "MetaTrader",
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.iconContainer,
              focused && {
                backgroundColor: `${theme.colors.accent}33`,
                borderWidth: 2,
                borderColor: `${theme.colors.accent}80`,
                shadowColor: theme.colors.accent,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.5,
                shadowRadius: 12,
                elevation: 10,
              }
            ]}>
              <Wallet
                color={focused ? theme.colors.textPrimary : theme.colors.navInactiveColor}
                size={25}
                strokeWidth={focused ? 2.8 : 2.2}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
});