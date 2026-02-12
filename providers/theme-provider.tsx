import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Theme definitions
export interface ThemeColors {
  // Backgrounds
  background: string;
  backgroundSecondary: string;
  cardBackground: string;
  
  // Gradients
  primaryGradient: string[];
  cardGradient: string[];
  glowGradient: string[];
  
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  
  // Accents
  accent: string;
  accentSecondary: string;
  success: string;
  error: string;
  warning: string;
  
  // UI Elements
  borderColor: string;
  glowColor: string;
  overlayColor: string;
  
  // Status
  statusActive: string;
  statusInactive: string;
  
  // Navigation
  navBackground: string;
  navActiveColor: string;
  navInactiveColor: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
  isDark: boolean;
}

// Current Purple/Pink/Orange gradient theme
export const purpleTheme: Theme = {
  name: 'purple',
  isDark: true,
  colors: {
    background: '#0a0a1a',
    backgroundSecondary: '#1a1a2e',
    cardBackground: 'rgba(139, 92, 246, 0.15)',
    
    primaryGradient: ['#8B5CF6', '#EC4899', '#F97316'],
    cardGradient: ['rgba(139, 92, 246, 0.3)', 'rgba(236, 72, 153, 0.2)', 'rgba(249, 115, 22, 0.1)'],
    glowGradient: ['rgba(139, 92, 246, 0.6)', 'rgba(236, 72, 153, 0.4)', 'transparent'],
    
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.8)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    
    accent: '#8B5CF6',
    accentSecondary: '#EC4899',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    
    borderColor: 'rgba(139, 92, 246, 0.3)',
    glowColor: 'rgba(139, 92, 246, 0.5)',
    overlayColor: 'rgba(0, 0, 0, 0.5)',
    
    statusActive: '#10B981',
    statusInactive: '#6B7280',
    
    navBackground: 'rgba(10, 10, 26, 0.95)',
    navActiveColor: '#8B5CF6',
    navInactiveColor: 'rgba(255, 255, 255, 0.5)',
  },
};

// Cyber/Tech theme from the reference image
export const cyberTheme: Theme = {
  name: 'cyber',
  isDark: true,
  colors: {
    background: '#0d0d1a',
    backgroundSecondary: '#13132a',
    cardBackground: 'rgba(88, 28, 135, 0.25)',
    
    primaryGradient: ['#581C87', '#7C3AED', '#4F46E5'],
    cardGradient: ['rgba(88, 28, 135, 0.4)', 'rgba(124, 58, 237, 0.3)', 'rgba(79, 70, 229, 0.2)'],
    glowGradient: ['rgba(124, 58, 237, 0.8)', 'rgba(88, 28, 135, 0.5)', 'transparent'],
    
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.85)',
    textMuted: 'rgba(255, 255, 255, 0.6)',
    
    accent: '#7C3AED',
    accentSecondary: '#A855F7',
    success: '#22C55E',
    error: '#EF4444',
    warning: '#FBBF24',
    
    borderColor: 'rgba(124, 58, 237, 0.5)',
    glowColor: 'rgba(124, 58, 237, 0.7)',
    overlayColor: 'rgba(13, 13, 26, 0.7)',
    
    statusActive: '#22C55E',
    statusInactive: '#64748B',
    
    navBackground: 'rgba(13, 13, 26, 0.98)',
    navActiveColor: '#A855F7',
    navInactiveColor: 'rgba(255, 255, 255, 0.4)',
  },
};

// ============ LIGHT POPPY THEMES ============

// Sunrise - Warm Orange/Yellow/Pink bright theme
export const sunriseTheme: Theme = {
  name: 'sunrise',
  isDark: false,
  colors: {
    background: '#FFF7ED',
    backgroundSecondary: '#FFEDD5',
    cardBackground: 'rgba(251, 146, 60, 0.15)',
    
    primaryGradient: ['#F97316', '#FBBF24', '#F472B6'],
    cardGradient: ['rgba(249, 115, 22, 0.3)', 'rgba(251, 191, 36, 0.2)', 'rgba(244, 114, 182, 0.15)'],
    glowGradient: ['rgba(249, 115, 22, 0.5)', 'rgba(251, 191, 36, 0.3)', 'transparent'],
    
    textPrimary: '#1C1917',
    textSecondary: 'rgba(28, 25, 23, 0.8)',
    textMuted: 'rgba(28, 25, 23, 0.5)',
    
    accent: '#F97316',
    accentSecondary: '#FBBF24',
    success: '#22C55E',
    error: '#EF4444',
    warning: '#F59E0B',
    
    borderColor: 'rgba(249, 115, 22, 0.3)',
    glowColor: 'rgba(249, 115, 22, 0.4)',
    overlayColor: 'rgba(255, 247, 237, 0.9)',
    
    statusActive: '#22C55E',
    statusInactive: '#9CA3AF',
    
    navBackground: 'rgba(255, 247, 237, 0.98)',
    navActiveColor: '#F97316',
    navInactiveColor: 'rgba(28, 25, 23, 0.4)',
  },
};

// Ocean - Fresh Blue/Cyan/Teal bright theme
export const oceanTheme: Theme = {
  name: 'ocean',
  isDark: false,
  colors: {
    background: '#ECFEFF',
    backgroundSecondary: '#CFFAFE',
    cardBackground: 'rgba(6, 182, 212, 0.15)',
    
    primaryGradient: ['#0891B2', '#06B6D4', '#2DD4BF'],
    cardGradient: ['rgba(8, 145, 178, 0.3)', 'rgba(6, 182, 212, 0.2)', 'rgba(45, 212, 191, 0.15)'],
    glowGradient: ['rgba(6, 182, 212, 0.5)', 'rgba(45, 212, 191, 0.3)', 'transparent'],
    
    textPrimary: '#134E4A',
    textSecondary: 'rgba(19, 78, 74, 0.8)',
    textMuted: 'rgba(19, 78, 74, 0.5)',
    
    accent: '#0891B2',
    accentSecondary: '#06B6D4',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    
    borderColor: 'rgba(6, 182, 212, 0.3)',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    overlayColor: 'rgba(236, 254, 255, 0.9)',
    
    statusActive: '#10B981',
    statusInactive: '#9CA3AF',
    
    navBackground: 'rgba(236, 254, 255, 0.98)',
    navActiveColor: '#0891B2',
    navInactiveColor: 'rgba(19, 78, 74, 0.4)',
  },
};

// Mint - Fresh Green/Lime bright theme
export const mintTheme: Theme = {
  name: 'mint',
  isDark: false,
  colors: {
    background: '#F0FDF4',
    backgroundSecondary: '#DCFCE7',
    cardBackground: 'rgba(34, 197, 94, 0.15)',
    
    primaryGradient: ['#16A34A', '#22C55E', '#4ADE80'],
    cardGradient: ['rgba(22, 163, 74, 0.3)', 'rgba(34, 197, 94, 0.2)', 'rgba(74, 222, 128, 0.15)'],
    glowGradient: ['rgba(34, 197, 94, 0.5)', 'rgba(74, 222, 128, 0.3)', 'transparent'],
    
    textPrimary: '#14532D',
    textSecondary: 'rgba(20, 83, 45, 0.8)',
    textMuted: 'rgba(20, 83, 45, 0.5)',
    
    accent: '#16A34A',
    accentSecondary: '#22C55E',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    
    borderColor: 'rgba(34, 197, 94, 0.3)',
    glowColor: 'rgba(34, 197, 94, 0.4)',
    overlayColor: 'rgba(240, 253, 244, 0.9)',
    
    statusActive: '#10B981',
    statusInactive: '#9CA3AF',
    
    navBackground: 'rgba(240, 253, 244, 0.98)',
    navActiveColor: '#16A34A',
    navInactiveColor: 'rgba(20, 83, 45, 0.4)',
  },
};

// All themes array for cycling
export const ALL_THEMES: Theme[] = [purpleTheme, cyberTheme, sunriseTheme, oceanTheme, mintTheme];
export type ThemeName = 'purple' | 'cyber' | 'sunrise' | 'ocean' | 'mint';

interface ThemeContextType {
  theme: Theme;
  themeName: string;
  toggleTheme: () => void;
  setTheme: (themeName: ThemeName) => void;
  isShakeEnabled: boolean;
  setShakeEnabled: (enabled: boolean) => void;
  allThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const SHAKE_THRESHOLD = 2.5; // Acceleration threshold to detect shake
const SHAKE_TIMEOUT = 300; // Time window for counting shakes (ms)
const REQUIRED_SHAKES = 3; // Number of shakes required to trigger

interface ThemeProviderProps {
  children: React.ReactNode;
}

const THEME_STORAGE_KEY = '@ea_trade_theme';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(purpleTheme);
  const [isShakeEnabled, setShakeEnabled] = useState(true);
  
  const lastShakeTime = useRef<number>(0);
  const shakeCount = useRef<number>(0);
  const subscription = useRef<any>(null);

  // Load saved theme on mount
  useEffect(() => {
    const loadSavedTheme = async () => {
      try {
        const savedThemeName = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedThemeName) {
          const savedTheme = ALL_THEMES.find(t => t.name === savedThemeName);
          if (savedTheme) {
            setCurrentTheme(savedTheme);
            console.log(`🎨 Loaded saved theme: ${savedThemeName}`);
          }
        }
      } catch (error) {
        console.error('Error loading saved theme:', error);
      }
    };
    loadSavedTheme();
  }, []);

  const toggleTheme = useCallback(async () => {
    setCurrentTheme(prev => {
      // Find current theme index and cycle to next
      const currentIndex = ALL_THEMES.findIndex(t => t.name === prev.name);
      const nextIndex = (currentIndex + 1) % ALL_THEMES.length;
      const newTheme = ALL_THEMES[nextIndex];
      
      console.log(`🎨 Theme switched to: ${newTheme.name} (${nextIndex + 1}/${ALL_THEMES.length})`);
      
      // Save theme preference
      AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme.name).catch(err => {
        console.error('Error saving theme:', err);
      });
      
      // Vibrate on theme change (mobile only)
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 50, 50, 50]);
      }
      return newTheme;
    });
  }, []);

  const setTheme = useCallback(async (themeName: ThemeName) => {
    const newTheme = ALL_THEMES.find(t => t.name === themeName) || purpleTheme;
    setCurrentTheme(newTheme);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, themeName);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  }, []);

  // Web keyboard shortcut (Shift + T to toggle theme)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleKeyPress = (event: KeyboardEvent) => {
      // Shift + T to toggle theme
      if (event.shiftKey && event.key === 'T') {
        console.log('⌨️ Keyboard shortcut detected! Toggling theme...');
        toggleTheme();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [toggleTheme]);

  // Web shake detection using DeviceMotion API (for iOS PWA)
  useEffect(() => {
    if (Platform.OS !== 'web' || !isShakeEnabled) return;
    if (typeof window === 'undefined') return;

    const WEB_SHAKE_THRESHOLD = 25; // Higher threshold for web (acceleration includes gravity)
    const WEB_SHAKE_TIMEOUT = 500; // Time window for counting shakes (ms)
    const WEB_REQUIRED_SHAKES = 3; // Number of shakes required
    
    let webLastShakeTime = 0;
    let webShakeCount = 0;
    let lastX = 0, lastY = 0, lastZ = 0;
    let hasRequestedPermission = false;

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration || acceleration.x === null || acceleration.y === null || acceleration.z === null) {
        return;
      }

      const x = acceleration.x || 0;
      const y = acceleration.y || 0;
      const z = acceleration.z || 0;

      // Calculate change in acceleration (delta)
      const deltaX = Math.abs(x - lastX);
      const deltaY = Math.abs(y - lastY);
      const deltaZ = Math.abs(z - lastZ);
      
      lastX = x;
      lastY = y;
      lastZ = z;

      const totalDelta = deltaX + deltaY + deltaZ;
      const now = Date.now();

      if (totalDelta > WEB_SHAKE_THRESHOLD) {
        if (now - webLastShakeTime > WEB_SHAKE_TIMEOUT) {
          // Reset shake count if too much time has passed
          webShakeCount = 0;
        }
        
        webShakeCount += 1;
        webLastShakeTime = now;

        console.log(`📱 Web shake detected! Count: ${webShakeCount}/${WEB_REQUIRED_SHAKES}, Delta: ${totalDelta.toFixed(1)}`);

        if (webShakeCount >= WEB_REQUIRED_SHAKES) {
          console.log('📱 Web shake threshold reached! Toggling theme...');
          toggleTheme();
          webShakeCount = 0;
          
          // Vibrate if supported (iOS 13+)
          if ('vibrate' in navigator) {
            try {
              navigator.vibrate([50, 50, 50]);
            } catch (e) {
              // Vibration not supported
            }
          }
        }
      }
    };

    const requestPermissionAndListen = async () => {
      // Check if DeviceMotionEvent is available
      if (!('DeviceMotionEvent' in window)) {
        console.log('📱 DeviceMotion not supported on this device');
        return;
      }

      // iOS 13+ requires permission request
      const DeviceMotionEventWithPermission = DeviceMotionEvent as any;
      if (typeof DeviceMotionEventWithPermission.requestPermission === 'function' && !hasRequestedPermission) {
        try {
          const permission = await DeviceMotionEventWithPermission.requestPermission();
          hasRequestedPermission = true;
          if (permission === 'granted') {
            console.log('📱 DeviceMotion permission granted');
            window.addEventListener('devicemotion', handleDeviceMotion);
          } else {
            console.log('📱 DeviceMotion permission denied');
          }
        } catch (error) {
          console.error('Error requesting DeviceMotion permission:', error);
        }
      } else {
        // Non-iOS or permission already granted
        console.log('📱 Adding DeviceMotion listener for web shake detection');
        window.addEventListener('devicemotion', handleDeviceMotion);
      }
    };

    // Request permission on first user interaction (required for iOS)
    const handleFirstInteraction = () => {
      requestPermissionAndListen();
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('click', handleFirstInteraction);
    };

    // Try to add listener immediately (works on Android and non-iOS)
    if (!('DeviceMotionEvent' in window) || typeof (DeviceMotionEvent as any).requestPermission !== 'function') {
      window.addEventListener('devicemotion', handleDeviceMotion);
      console.log('📱 DeviceMotion listener added (no permission required)');
    } else {
      // iOS requires user gesture to request permission
      document.addEventListener('touchstart', handleFirstInteraction, { once: true });
      document.addEventListener('click', handleFirstInteraction, { once: true });
      console.log('📱 Waiting for user interaction to request DeviceMotion permission (iOS)');
    }

    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('click', handleFirstInteraction);
    };
  }, [isShakeEnabled, toggleTheme]);

  // Native shake detection (Android/iOS native app)
  useEffect(() => {
    if (!isShakeEnabled || Platform.OS === 'web') {
      return;
    }

    const handleShake = ({ x, y, z }: { x: number; y: number; z: number }) => {
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      if (acceleration > SHAKE_THRESHOLD) {
        if (now - lastShakeTime.current > SHAKE_TIMEOUT) {
          // Reset shake count if too much time has passed
          shakeCount.current = 0;
        }
        
        shakeCount.current += 1;
        lastShakeTime.current = now;

        if (shakeCount.current >= REQUIRED_SHAKES) {
          console.log('📱 Shake detected! Toggling theme...');
          toggleTheme();
          shakeCount.current = 0;
        }
      }
    };

    // Set update interval
    Accelerometer.setUpdateInterval(100);

    // Subscribe to accelerometer
    subscription.current = Accelerometer.addListener(handleShake);

    return () => {
      if (subscription.current) {
        subscription.current.remove();
        subscription.current = null;
      }
    };
  }, [isShakeEnabled, toggleTheme]);

  const value: ThemeContextType = {
    theme: currentTheme,
    themeName: currentTheme.name,
    toggleTheme,
    setTheme,
    isShakeEnabled,
    setShakeEnabled,
    allThemes: ALL_THEMES,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeProvider;
