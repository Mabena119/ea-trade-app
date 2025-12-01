import { Platform, NativeModules } from 'react-native';
import { isIOSPWA, triggerNativeApp } from '@/utils/pwa-detection';

interface WidgetDataManagerInterface {
  updateWidgetData(botName: string, isActive: boolean, isPaused: boolean, botImageURL?: string | null): Promise<boolean>;
  syncWidgetPollingState(): Promise<{ isPaused: boolean; wasToggled: boolean }>;
}

const { WidgetDataManager } = NativeModules as {
  WidgetDataManager?: WidgetDataManagerInterface;
};

interface WidgetService {
  updateWidget(botName: string, isActive: boolean, isPaused: boolean, botImageURL?: string | null): Promise<void>;
}

class WidgetService implements WidgetService {
  async updateWidget(botName: string, isActive: boolean, isPaused: boolean, botImageURL?: string | null): Promise<void> {
    // Check if running as PWA on iOS
    const isPWA = Platform.OS === 'web' && isIOSPWA();
    
    // Try native modules first (works in native iOS app)
    if (Platform.OS === 'ios' && WidgetDataManager) {
      try {
        await WidgetDataManager.updateWidgetData(botName, isActive, isPaused, botImageURL || null);
        console.log('Widget data updated via native module:', { botName, isActive, isPaused, botImageURL });
        return;
      } catch (error) {
        console.error('Error updating widget via native module:', error);
        // Fall through to PWA communication
      }
    }

    // If PWA on iOS, try to communicate with native app
    if (isPWA) {
      try {
        // Store widget data in localStorage for native app to read
        const widgetData = {
          botName,
          isActive,
          isPaused,
          botImageURL: botImageURL || null,
          timestamp: Date.now(),
        };
        
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('widgetData', JSON.stringify(widgetData));
          console.log('Widget data stored in localStorage for native app:', widgetData);
        }

        // Try to trigger native app via URL scheme
        // This will open the native app if it's installed
        const triggered = await triggerNativeApp('updateWidget', widgetData);
        if (triggered) {
          console.log('Triggered native app for widget update via URL scheme');
          
          // Also try to write to App Group UserDefaults if possible
          // Note: PWAs can't directly access App Groups, but we can try
          // The native app should read from localStorage or URL params
        }
      } catch (error) {
        console.error('Error communicating with native app from PWA:', error);
      }
    }
  }

  async syncWidgetPollingState(): Promise<{ isPaused: boolean; wasToggled: boolean } | null> {
    if (Platform.OS !== 'ios') {
      return null;
    }

    if (!WidgetDataManager) {
      console.warn('WidgetDataManager native module not available');
      return null;
    }

    try {
      const result = await WidgetDataManager.syncWidgetPollingState();
      return result as { isPaused: boolean; wasToggled: boolean };
    } catch (error) {
      console.error('Error syncing widget polling state:', error);
      return null;
    }
  }
}

export const widgetService = new WidgetService();

