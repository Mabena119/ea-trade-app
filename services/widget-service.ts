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
    console.log('[WidgetService] updateWidget called:', { 
      platform: Platform.OS, 
      botName, 
      isActive, 
      isPaused, 
      botImageURL,
      hasNativeModule: !!WidgetDataManager 
    });
    
    // Check if running as PWA on iOS
    const isPWA = Platform.OS === 'web' && isIOSPWA();
    console.log('[WidgetService] PWA check:', { isPWA, platform: Platform.OS });
    
    // Widgets don't work in PWAs - skip widget updates for PWA
    // Use notifications instead (handled by pwa-notification-service)
    if (isPWA) {
      console.log('[WidgetService] Running as iOS PWA - widgets not supported, skipping widget update');
      console.log('[WidgetService] Use notifications instead for PWA (handled by notification service)');
      return;
    }
    
    // Try native modules (works in native iOS app only)
    if (Platform.OS === 'ios' && WidgetDataManager) {
      try {
        await WidgetDataManager.updateWidgetData(botName, isActive, isPaused, botImageURL || null);
        console.log('[WidgetService] ✅ Widget data updated via native module:', { botName, isActive, isPaused, botImageURL });
        return;
      } catch (error) {
        console.error('[WidgetService] ❌ Error updating widget via native module:', error);
      }
    } else {
      console.log('[WidgetService] Not native iOS app - skipping widget update');
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

