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

interface ThemeContextType {
  theme: Theme;
  themeName: string;
  toggleTheme: () => void;
  setTheme: (themeName: 'purple' | 'cyber') => void;
  isShakeEnabled: boolean;
  setShakeEnabled: (enabled: boolean) => void;
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
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'cyber') {
          setCurrentTheme(cyberTheme);
          console.log('🎨 Loaded saved theme: cyber');
        }
      } catch (error) {
        console.error('Error loading saved theme:', error);
      }
    };
    loadSavedTheme();
  }, []);

  const toggleTheme = useCallback(async () => {
    setCurrentTheme(prev => {
      const newTheme = prev.name === 'purple' ? cyberTheme : purpleTheme;
      console.log(`🎨 Theme switched to: ${newTheme.name}`);
      
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

  const setTheme = useCallback(async (themeName: 'purple' | 'cyber') => {
    const newTheme = themeName === 'purple' ? purpleTheme : cyberTheme;
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

  // Shake detection (mobile only)
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
