import { Platform } from 'react-native';

/**
 * Detects if the app is running as a PWA (Progressive Web App) on iOS
 */
export function isIOSPWA(): boolean {
  if (Platform.OS !== 'web') {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  // Check if running in standalone mode (PWA)
  const isStandalone = (window.navigator as any).standalone === true ||
    (window.matchMedia('(display-mode: standalone)').matches) ||
    document.referrer.includes('android-app://');

  // Check if on iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return isStandalone && isIOS;
}

/**
 * Detects if the app is running in a browser (not PWA)
 */
export function isInBrowser(): boolean {
  if (Platform.OS !== 'web') {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return !isIOSPWA() && !(window.navigator as any).standalone;
}

/**
 * Checks if native iOS app might be available via App Groups
 * This uses localStorage to check if native app has written data
 */
export function checkNativeAppAvailable(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  try {
    // Check if App Group data exists (native app would write this)
    const appGroupData = localStorage.getItem('group.app.eatrade.automated.forex.trading.app');
    return appGroupData !== null;
  } catch {
    return false;
  }
}

/**
 * Attempts to communicate with native iOS app via URL scheme
 * Uses multiple methods to avoid Safari errors when app isn't installed
 */
export async function triggerNativeApp(action: string, data?: Record<string, any>): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  try {
    const scheme = 'myapp://';
    const params = new URLSearchParams({
      action,
      ...data,
      timestamp: Date.now().toString(),
    });
    const url = `${scheme}widget?${params.toString()}`;
    
    console.log('Attempting to trigger native app via URL scheme:', url);
    
    // Method 1: Try iframe first (silent, no error popup)
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.src = url;
      
      document.body.appendChild(iframe);
      
      // Remove iframe after attempt
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        } catch (e) {
          // Ignore if already removed
        }
      }, 500);
    } catch (iframeError) {
      console.log('Iframe method failed, trying window.open:', iframeError);
      
      // Method 2: Try window.open as fallback
      try {
        const opened = window.open(url, '_blank');
        if (!opened) {
          // If window.open was blocked, try location.replace
          setTimeout(() => {
            try {
              window.location.replace(url);
            } catch (e) {
              console.log('All URL scheme methods failed - native app may not be installed');
            }
          }, 100);
        }
      } catch (openError) {
        console.log('Window.open failed:', openError);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error triggering native app:', error);
    return false;
  }
}

