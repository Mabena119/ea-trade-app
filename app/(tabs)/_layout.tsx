import { Tabs } from "expo-router";
import { Home, Settings, TrendingUp } from "lucide-react-native";
import React from "react";
import { useApp } from "@/providers/app-provider";
import { Platform } from "react-native";
import { BlurView } from 'expo-blur';
import colors from "@/constants/colors";

export default function TabLayout() {
  const { isFirstTime } = useApp();
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isFirstTime ? {
          display: 'none',
        } : {
          position: 'absolute',
          bottom: 20,
          left: 20,
          right: 20,
          height: 70,
          backgroundColor: Platform.OS === 'ios' ? 'rgba(17, 27, 33, 0.85)' : colors.glass.background,
          borderRadius: 35,
          borderWidth: 1,
          borderColor: colors.glass.border,
          borderTopWidth: 1,
          borderTopColor: colors.glass.border,
          paddingBottom: 10,
          paddingTop: 10,
          shadowColor: colors.glass.shadow,
          shadowOffset: {
            width: 0,
            height: 10,
          },
          shadowOpacity: 0.5,
          shadowRadius: 20,
          elevation: 10,
          overflow: 'hidden',
        },
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 35,
                overflow: 'hidden',
              }}
            />
          ) : null
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: -5,
        },
        tabBarIconStyle: {
          marginTop: 5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Home 
              color={color} 
              size={24} 
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          title: "Quotes",
          tabBarIcon: ({ color, focused }) => (
            <TrendingUp 
              color={color} 
              size={24}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="metatrader"
        options={{
          title: "MetaTrader",
          tabBarIcon: ({ color, focused }) => (
            <Settings 
              color={color} 
              size={24}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
    </Tabs>
  );
}