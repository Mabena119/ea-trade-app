import { Tabs } from "expo-router";
import { Home, Settings, TrendingUp } from "lucide-react-native";
import React from "react";
import { useApp } from "@/providers/app-provider";
import { Platform, View, StyleSheet } from "react-native";
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
          height: 65,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(17, 27, 33, 0.35)',
          borderRadius: 32,
          borderWidth: 0.2,
          borderColor: 'rgba(255, 255, 255, 0.06)',
          borderTopWidth: 0.2,
          borderTopColor: 'rgba(255, 255, 255, 0.06)',
          paddingBottom: 6,
          paddingTop: 6,
          paddingHorizontal: 12,
          shadowColor: '#000000',
          shadowOffset: {
            width: 0,
            height: 12,
          },
          shadowOpacity: 0.8,
          shadowRadius: 24,
          elevation: 25,
          overflow: 'hidden',
        },
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={130}
              tint="dark"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 32,
                overflow: 'hidden',
                backgroundColor: 'rgba(17, 27, 33, 0.25)',
              }}
            />
          ) : (
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 32,
              backgroundColor: 'rgba(17, 27, 33, 0.35)',
            }} />
          )
        ),
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.45)',
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
              focused && styles.iconContainerActive
            ]}>
              <Home 
                color={focused ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)'} 
                size={23} 
                strokeWidth={focused ? 2.5 : 2}
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
              focused && styles.iconContainerActive
            ]}>
              <TrendingUp 
                color={focused ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)'} 
                size={23}
                strokeWidth={focused ? 2.5 : 2}
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
              focused && styles.iconContainerActive
            ]}>
              <Settings 
                color={focused ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)'} 
                size={23}
                strokeWidth={focused ? 2.5 : 2}
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
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#FFFFFF',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});