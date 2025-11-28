import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

interface WidgetServiceInterface {
  updateWidgetData(botName: string, isActive: boolean, logoUrl?: string): Promise<void>;
}

class WidgetService implements WidgetServiceInterface {
  async updateWidgetData(botName: string, isActive: boolean, logoUrl?: string): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      // Use UserDefaults with App Group to share data with widget
      const { WidgetDataManager } = NativeModules as {
        WidgetDataManager?: {
          updateWidgetData(botName: string, isActive: boolean, logoUrl?: string): Promise<void>;
        };
      };

      if (WidgetDataManager) {
        await WidgetDataManager.updateWidgetData(botName, isActive, logoUrl);
      } else {
        console.warn('WidgetDataManager native module not available');
      }
    } catch (error) {
      console.error('Error updating widget data:', error);
    }
  }
}

export const widgetService = new WidgetService();

