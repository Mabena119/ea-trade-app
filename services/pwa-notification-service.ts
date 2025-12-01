import { Platform } from 'react-native';
import { isIOSPWA } from '@/utils/pwa-detection';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
}

class PWANotificationService {
  private permissionGranted: boolean | null = null;
  private notificationTag = 'ea-trade-bot-status';

  /**
   * Request notification permission from the user
   * Must be called in response to a user gesture (e.g., button click)
   */
  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'web') {
      console.log('[Notifications] Not available on non-web platform');
      return false;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('[Notifications] Notifications API not available');
      return false;
    }

    try {
      // Check if already granted
      if (Notification.permission === 'granted') {
        this.permissionGranted = true;
        return true;
      }

      // Request permission (must be in response to user gesture)
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === 'granted';
      
      if (this.permissionGranted) {
        console.log('[Notifications] ✅ Permission granted');
      } else {
        console.log('[Notifications] ❌ Permission denied:', permission);
      }
      
      return this.permissionGranted;
    } catch (error) {
      console.error('[Notifications] Error requesting permission:', error);
      this.permissionGranted = false;
      return false;
    }
  }

  /**
   * Check if notification permission has been granted
   */
  hasPermission(): boolean {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    return Notification.permission === 'granted';
  }

  /**
   * Show a notification with bot information
   */
  async showBotNotification(
    botName: string,
    isActive: boolean,
    isPaused: boolean,
    botImageURL?: string | null
  ): Promise<void> {
    if (Platform.OS !== 'web') {
      return;
    }

    // Only show notifications for iOS PWA
    if (!isIOSPWA()) {
      console.log('[Notifications] Not iOS PWA - skipping notification');
      return;
    }

    if (!this.hasPermission()) {
      console.log('[Notifications] Permission not granted - requesting...');
      const granted = await this.requestPermission();
      if (!granted) {
        console.log('[Notifications] Permission denied - cannot show notification');
        return;
      }
    }

    try {
      const status = isActive 
        ? (isPaused ? 'PAUSED' : 'ACTIVE')
        : 'INACTIVE';
      
      const statusEmoji = isActive 
        ? (isPaused ? '⏸️' : '🟢')
        : '🔴';

      const options: NotificationOptions = {
        title: `${statusEmoji} ${botName}`,
        body: `Bot Status: ${status}`,
        tag: this.notificationTag, // Replace previous notification with same tag
        requireInteraction: false, // Auto-dismiss after a few seconds
        badge: isActive ? '1' : '0',
      };

      // Add icon if available
      if (botImageURL) {
        options.icon = botImageURL;
      }

      // Close any existing notification with the same tag
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // If service worker is available, use it for better control
        // For now, we'll use direct notifications
      }

      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon,
        tag: options.tag,
        badge: options.badge,
        requireInteraction: options.requireInteraction,
        silent: false,
      });

      console.log('[Notifications] ✅ Notification shown:', {
        title: options.title,
        body: options.body,
        tag: options.tag,
      });

      // Auto-close notification after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      // Handle notification click
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        notification.close();
      };

    } catch (error) {
      console.error('[Notifications] Error showing notification:', error);
    }
  }

  /**
   * Show a persistent notification that stays in Notification Center
   * This replaces the previous notification with the same tag
   */
  async showPersistentBotNotification(
    botName: string,
    isActive: boolean,
    isPaused: boolean,
    botImageURL?: string | null
  ): Promise<void> {
    if (Platform.OS !== 'web') {
      return;
    }

    // Only show notifications for iOS PWA
    if (!isIOSPWA()) {
      return;
    }

    if (!this.hasPermission()) {
      const granted = await this.requestPermission();
      if (!granted) {
        return;
      }
    }

    try {
      const status = isActive 
        ? (isPaused ? 'PAUSED' : 'ACTIVE')
        : 'INACTIVE';
      
      const statusEmoji = isActive 
        ? (isPaused ? '⏸️' : '🟢')
        : '🔴';

      const options: NotificationOptions = {
        title: `${statusEmoji} ${botName}`,
        body: `Status: ${status}${isActive && !isPaused ? ' • Monitoring signals' : ''}`,
        tag: this.notificationTag,
        requireInteraction: false,
        badge: isActive ? '1' : '0',
      };

      if (botImageURL) {
        options.icon = botImageURL;
      }

      // Create notification (will replace previous one with same tag)
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon,
        tag: options.tag,
        badge: options.badge,
        requireInteraction: false,
        silent: false,
      });

      console.log('[Notifications] ✅ Persistent notification shown:', {
        title: options.title,
        body: options.body,
      });

      // Don't auto-close persistent notifications
      // They'll stay in Notification Center until user dismisses or app updates them

      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
      };

    } catch (error) {
      console.error('[Notifications] Error showing persistent notification:', error);
    }
  }

  /**
   * Close the bot status notification
   */
  closeBotNotification(): void {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    // Note: We can't directly close notifications by tag in the Web Notifications API
    // The notification will be replaced when we show a new one with the same tag
    console.log('[Notifications] Notification will be replaced on next update');
  }
}

export const pwaNotificationService = new PWANotificationService();

