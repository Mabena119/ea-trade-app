import { Platform, NativeModules } from 'react-native';

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
    if (Platform.OS !== 'ios') {
      return;
    }

    if (!WidgetDataManager) {
      console.warn('WidgetDataManager native module not available');
      return;
    }

    try {
      await WidgetDataManager.updateWidgetData(botName, isActive, isPaused, botImageURL || null);
      console.log('Widget data updated:', { botName, isActive, isPaused, botImageURL });
    } catch (error) {
      console.error('Error updating widget:', error);
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

