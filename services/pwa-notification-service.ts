import { Platform, AppState } from 'react-native';
import { isIOSPWA } from '@/utils/pwa-detection';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
}

interface PendingNotification {
  botName: string;
  isActive: boolean;
  isPaused: boolean;
  botImageURL?: string | null;
}

class PWANotificationService {
  private permissionGranted: boolean | null = null;
  private notificationTag = 'ea-trade-bot-status';
  private pendingNotification: PendingNotification | null = null;
  private appStateListener: any = null;
  private currentAppState: string = 'active';

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
   * Initialize app state tracking for iOS PWA
   * Call this once when the service is first used
   */
  initializeAppStateTracking(): void {
    if (Platform.OS !== 'web' || !isIOSPWA()) {
      return;
    }

    // Get current app state
    this.currentAppState = AppState.currentState;
    console.log('[Notifications] Initial app state:', this.currentAppState);

    // Listen for app state changes
    if (!this.appStateListener) {
      this.appStateListener = AppState.addEventListener('change', (nextAppState) => {
        const previousState = this.currentAppState;
        this.currentAppState = nextAppState;
        
        console.log('[Notifications] App state changed:', previousState, '->', nextAppState);

        // When app goes to background, show pending notification if bot is active
        if (previousState === 'active' && nextAppState.match(/inactive|background/)) {
          console.log('[Notifications] App moved to background - checking for pending notification');
          this.showPendingNotificationIfActive();
        }
      });
    }
  }

  /**
   * Show pending notification if bot is active
   * Called when app moves to background
   */
  private async showPendingNotificationIfActive(): Promise<void> {
    if (!this.pendingNotification) {
      console.log('[Notifications] No pending notification to show');
      return;
    }

    const { botName, isActive, isPaused, botImageURL } = this.pendingNotification;

    // Only show notification if bot is active
    if (isActive) {
      console.log('[Notifications] Bot is active - showing notification in background');
      await this.createNotification(botName, isActive, isPaused, botImageURL);
    } else {
      console.log('[Notifications] Bot is inactive - not showing notification');
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
   * Create and show the actual notification
   * This is called when app is in background
   */
  private async createNotification(
    botName: string,
    isActive: boolean,
    isPaused: boolean,
    botImageURL?: string | null
  ): Promise<void> {
    if (!this.hasPermission()) {
      console.log('[Notifications] No permission - cannot create notification');
      return;
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

      console.log('[Notifications] Creating notification:', {
        title,
        body,
        tag: this.notificationTag,
        appState: this.currentAppState,
      });

      // iOS Safari notification options - notification will appear in Notification Center
      const notificationOptions: any = {
        body: body,
        tag: this.notificationTag, // Same tag replaces previous notification
        requireInteraction: false, // Normal notification behavior - goes to Notification Center
        silent: false,
      };

      // iOS Safari may not support icon from remote URL, but try it
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

      console.log('[Notifications] ✅ Notification created and sent to Notification Center');

      // Handle notification events
      notification.onclick = (event) => {
        console.log('[Notifications] Notification clicked');
        event.preventDefault();
        window.focus();
      };

      notification.onshow = () => {
        console.log('[Notifications] ✅ Notification displayed');
      };

      notification.onerror = (error) => {
        console.error('[Notifications] ❌ Notification error:', error);
      };

      // Also update app badge
      try {
        if ('setAppBadge' in navigator && typeof (navigator as any).setAppBadge === 'function') {
          await (navigator as any).setAppBadge(isActive ? 1 : 0);
          console.log('[Notifications] ✅ App badge updated:', isActive ? 1 : 0);
        }
      } catch (badgeError) {
        console.log('[Notifications] Badge API not available:', badgeError);
      }

    } catch (error) {
      console.error('[Notifications] ❌ Error creating notification:', error);
    }
  }

  /**
   * Show a persistent notification that stays in Notification Center
   * If app is in foreground, stores notification as pending to show when app goes to background
   * If app is in background, shows notification immediately
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

    // Initialize app state tracking if not already done
    if (!this.appStateListener) {
      this.initializeAppStateTracking();
    }

    if (!this.hasPermission()) {
      const granted = await this.requestPermission();
      if (!granted) {
        return;
      }
    }

    // Store notification data (always update pending notification)
    this.pendingNotification = {
      botName,
      isActive,
      isPaused,
      botImageURL,
    };

    // Check current app state
    const isInBackground = this.currentAppState.match(/inactive|background/);
    
    if (isInBackground) {
      // App is in background - show notification immediately
      console.log('[Notifications] App is in background - showing notification now');
      await this.createNotification(botName, isActive, isPaused, botImageURL);
    } else {
      // App is in foreground - store as pending, will show when app goes to background
      console.log('[Notifications] App is in foreground - notification will show when app goes to background');
      console.log('[Notifications] Pending notification stored:', { botName, isActive, isPaused });
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

