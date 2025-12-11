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

interface CachedImage {
  dataUrl: string;
  timestamp: number;
}

class PWANotificationService {
  private permissionGranted: boolean | null = null;
  private notificationTag = 'ea-trade-bot-status';
  private pendingNotification: PendingNotification | null = null;
  private appStateListener: any = null;
  private currentAppState: string = 'active';
  private imageCache: Map<string, CachedImage> = new Map();
  private imageCacheExpiry = 5 * 60 * 1000; // 5 minutes

  /**
   * Convert image URL to base64 data URL for better notification icon support
   * iOS Safari has limited support for remote URLs in notification icons
   */
  private async getImageAsDataUrl(imageUrl: string): Promise<string | null> {
    if (!imageUrl) return null;

    // Check cache first
    const cached = this.imageCache.get(imageUrl);
    if (cached && Date.now() - cached.timestamp < this.imageCacheExpiry) {
      console.log('[Notifications] Using cached image data URL');
      return cached.dataUrl;
    }

    try {
      // Ensure full URL
      let fullUrl = imageUrl;
      if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        const filename = imageUrl.replace(/^\/+/, '');
        fullUrl = `https://www.eatrade.io/admin/uploads/${filename}`;
      }

      console.log('[Notifications] Fetching image for notification:', fullUrl);

      // Fetch the image
      const response = await fetch(fullUrl, {
        mode: 'cors',
        credentials: 'omit',
      });

      if (!response.ok) {
        console.error('[Notifications] Failed to fetch image:', response.status);
        return null;
      }

      // Convert to blob
      const blob = await response.blob();

      // Convert blob to base64 data URL
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          // Cache the result
          this.imageCache.set(imageUrl, {
            dataUrl,
            timestamp: Date.now(),
          });
          console.log('[Notifications] Image converted to data URL successfully');
          resolve(dataUrl);
        };
        reader.onerror = () => {
          console.error('[Notifications] Error converting image to data URL');
          resolve(null);
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('[Notifications] Error loading image for notification:', error);
      return null;
    }
  }

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
   * Uses Page Visibility API for web (more reliable than AppState on web)
   * Call this once when the service is first used
   */
  initializeAppStateTracking(): void {
    if (Platform.OS !== 'web' || !isIOSPWA()) {
      return;
    }

    if (typeof document === 'undefined') {
      return;
    }

    // Use Page Visibility API for web (more reliable than AppState)
    const isVisible = !document.hidden;
    this.currentAppState = isVisible ? 'active' : 'background';
    console.log('[Notifications] Initial app state (Page Visibility):', this.currentAppState, 'hidden:', document.hidden);

    // Listen for visibility changes (when user switches apps or backgrounds the page)
    if (!this.appStateListener) {
      const handleVisibilityChange = () => {
        const isNowVisible = !document.hidden;
        const previousState = this.currentAppState;
        this.currentAppState = isNowVisible ? 'active' : 'background';
        
        console.log('[Notifications] Page visibility changed:', previousState, '->', this.currentAppState, 'hidden:', document.hidden);

        // When page becomes hidden (app goes to background), show pending notification if bot is active
        if (previousState === 'active' && !isNowVisible) {
          console.log('[Notifications] Page hidden (app backgrounded) - checking for pending notification');
          this.showPendingNotificationIfActive();
        }
      };

      // Also listen to AppState as fallback
      const handleAppStateChange = (nextAppState: string) => {
        const previousState = this.currentAppState;
        this.currentAppState = nextAppState;
        
        console.log('[Notifications] AppState changed:', previousState, '->', nextAppState);

        // When app goes to background, show pending notification if bot is active
        if (previousState === 'active' && nextAppState.match(/inactive|background/)) {
          console.log('[Notifications] AppState backgrounded - checking for pending notification');
          this.showPendingNotificationIfActive();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
      
      // Store both listeners for cleanup
      this.appStateListener = {
        visibility: handleVisibilityChange,
        appState: appStateSubscription,
      };
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

      // Try to load bot image as data URL for better iOS Safari support
      if (botImageURL) {
        try {
          console.log('[Notifications] Loading bot image for notification...');
          const imageDataUrl = await this.getImageAsDataUrl(botImageURL);
          if (imageDataUrl) {
            options.icon = imageDataUrl;
            console.log('[Notifications] ✅ Bot image loaded for notification');
          } else {
            // Fallback to direct URL
            options.icon = botImageURL.startsWith('http') 
              ? botImageURL 
              : `https://www.eatrade.io/admin/uploads/${botImageURL.replace(/^\/+/, '')}`;
          }
        } catch (e) {
          console.log('[Notifications] Could not load bot image:', e);
          options.icon = botImageURL.startsWith('http') 
            ? botImageURL 
            : `https://www.eatrade.io/admin/uploads/${botImageURL.replace(/^\/+/, '')}`;
        }
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
        hasIcon: !!options.icon,
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
        hasImageURL: !!botImageURL,
      });

      // iOS Safari notification options - notification will appear in Notification Center
      const notificationOptions: any = {
        body: body,
        tag: this.notificationTag, // Same tag replaces previous notification
        requireInteraction: false, // Normal notification behavior - goes to Notification Center
        silent: false,
      };

      // Try to load bot image as data URL for better iOS Safari support
      if (botImageURL) {
        try {
          console.log('[Notifications] Attempting to load bot image for notification icon...');
          const imageDataUrl = await this.getImageAsDataUrl(botImageURL);
          if (imageDataUrl) {
            notificationOptions.icon = imageDataUrl;
            console.log('[Notifications] ✅ Bot image loaded as data URL for notification icon');
          } else {
            // Fallback to direct URL
            notificationOptions.icon = botImageURL.startsWith('http') 
              ? botImageURL 
              : `https://www.eatrade.io/admin/uploads/${botImageURL.replace(/^\/+/, '')}`;
            console.log('[Notifications] Using direct URL for notification icon:', notificationOptions.icon);
          }
        } catch (e) {
          console.log('[Notifications] Could not load icon, using direct URL:', e);
          notificationOptions.icon = botImageURL.startsWith('http') 
            ? botImageURL 
            : `https://www.eatrade.io/admin/uploads/${botImageURL.replace(/^\/+/, '')}`;
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

    // Pre-load the bot image while app is in foreground (for faster notification display)
    if (botImageURL) {
      console.log('[Notifications] Pre-loading bot image for notification...');
      this.getImageAsDataUrl(botImageURL).then((dataUrl) => {
        if (dataUrl) {
          console.log('[Notifications] ✅ Bot image pre-loaded and cached for notification');
        }
      }).catch((e) => {
        console.log('[Notifications] Could not pre-load bot image:', e);
      });
    }

    // Store notification data (always update pending notification)
    this.pendingNotification = {
      botName,
      isActive,
      isPaused,
      botImageURL,
    };

    // Check if page is hidden (using Page Visibility API for web)
    const isPageHidden = typeof document !== 'undefined' && document.hidden;
    const isInBackground = isPageHidden || this.currentAppState.match(/inactive|background/);
    
    console.log('[Notifications] Visibility check:', {
      documentHidden: isPageHidden,
      appState: this.currentAppState,
      isInBackground,
      hasBotImage: !!botImageURL,
    });
    
    if (isInBackground) {
      // App/page is in background - show notification immediately
      console.log('[Notifications] App/page is in background - showing notification now');
      await this.createNotification(botName, isActive, isPaused, botImageURL);
    } else {
      // App/page is in foreground - store as pending, will show when app goes to background
      console.log('[Notifications] App/page is in foreground - notification will show when app goes to background');
      console.log('[Notifications] Pending notification stored:', { botName, isActive, isPaused, hasBotImage: !!botImageURL });
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

