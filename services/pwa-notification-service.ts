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
      console.log('[Notifications] Notification API not available:', {
        platform: Platform.OS,
        hasWindow: typeof window !== 'undefined',
        hasNotification: 'Notification' in (window || {}),
      });
      return false;
    }
    const permission = Notification.permission;
    console.log('[Notifications] Permission status:', permission);
    return permission === 'granted';
  }

  /**
   * Test notification - shows a simple test notification
   * Useful for debugging notification issues
   */
  async testNotification(): Promise<boolean> {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
      console.error('[Notifications] Test failed: Notification API not available');
      return false;
    }

    if (!this.hasPermission()) {
      console.log('[Notifications] Test: Requesting permission...');
      const granted = await this.requestPermission();
      if (!granted) {
        console.error('[Notifications] Test failed: Permission denied');
        return false;
      }
    }

    try {
      console.log('[Notifications] Test: Creating test notification...');
      const notification = new Notification('Test Notification', {
        body: 'If you see this, notifications are working!',
        tag: 'test-notification',
        silent: false,
      });

      notification.onshow = () => {
        console.log('[Notifications] ✅ Test notification displayed');
      };

      notification.onerror = (error) => {
        console.error('[Notifications] ❌ Test notification error:', error);
      };

      setTimeout(() => {
        notification.close();
      }, 3000);

      return true;
    } catch (error) {
      console.error('[Notifications] Test failed:', error);
      return false;
    }
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

      const title = `${statusEmoji} ${botName}`;
      const body = `Status: ${status}${isActive && !isPaused ? ' • Monitoring signals' : ''}`;

      console.log('[Notifications] Creating notification with options:', {
        title,
        body,
        tag: this.notificationTag,
        hasIcon: !!botImageURL,
        permission: Notification.permission,
      });

      // iOS Safari has limited support - use minimal options
      const notificationOptions: any = {
        body: body,
        tag: this.notificationTag,
        requireInteraction: false,
        silent: false,
      };

      // iOS Safari may not support icon from remote URL, but try it
      // If it fails, the notification will still show without icon
      if (botImageURL) {
        try {
          notificationOptions.icon = botImageURL;
        } catch (e) {
          console.log('[Notifications] Could not set icon:', e);
        }
      }

      // badge might not be supported on iOS Safari
      try {
        if (isActive) {
          notificationOptions.badge = '1';
        }
      } catch (e) {
        console.log('[Notifications] Badge not supported:', e);
      }

      // Create notification
      const notification = new Notification(title, notificationOptions);

      console.log('[Notifications] ✅ Notification created:', {
        title,
        body,
        tag: notificationOptions.tag,
        notification: notification ? 'created' : 'failed',
        permission: Notification.permission,
      });

      // Verify notification was created
      if (!notification) {
        console.error('[Notifications] ❌ Notification object is null');
        console.error('[Notifications] Check: Notification API available?', 'Notification' in window);
        console.error('[Notifications] Check: Permission status?', Notification.permission);
        return;
      }

      // Important: iOS Safari may not show notification banner when app is in foreground
      // Notification will appear in Notification Center (swipe down from top)
      console.log('[Notifications] ℹ️ Note: On iOS, notifications may only appear in Notification Center when app is in foreground.');
      console.log('[Notifications] ℹ️ Swipe down from top of screen to see Notification Center.');

      // Handle notification events
      notification.onclick = (event) => {
        console.log('[Notifications] Notification clicked');
        event.preventDefault();
        window.focus();
      };

      notification.onshow = () => {
        console.log('[Notifications] ✅ Notification displayed (onshow event fired)');
      };

      notification.onerror = (error) => {
        console.error('[Notifications] ❌ Notification error:', error);
      };

      notification.onclose = () => {
        console.log('[Notifications] Notification closed');
      };

      // Also update app badge (more reliable on iOS)
      try {
        if ('setAppBadge' in navigator && typeof (navigator as any).setAppBadge === 'function') {
          await (navigator as any).setAppBadge(isActive ? 1 : 0);
          console.log('[Notifications] ✅ App badge updated:', isActive ? 1 : 0);
        }
      } catch (badgeError) {
        console.log('[Notifications] Badge API not available:', badgeError);
      }

      // Note: iOS Safari may not show notification banner when app is in foreground
      // But notification should still appear in Notification Center
      // User can swipe down to see it

    } catch (error) {
      console.error('[Notifications] ❌ Error showing persistent notification:', error);
      console.error('[Notifications] Error details:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        Notification: typeof Notification !== 'undefined' ? 'available' : 'not available',
        permission: typeof Notification !== 'undefined' ? Notification.permission : 'N/A',
      });
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

