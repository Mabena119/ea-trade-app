import { Platform } from 'react-native';

/**
 * Detects if the app is running as a PWA (Progressive Web App) on iOS
 * This detects when the app is installed via "Add to Home Screen" on iOS
 */
export function isIOSPWA(): boolean {
  if (Platform.OS !== 'web') {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  // Check if running in standalone mode (PWA installed via "Add to Home Screen")
  // iOS Safari sets window.navigator.standalone to true when added to home screen
  const isStandalone = (window.navigator as any).standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  // Check if on iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const result = isStandalone && isIOS;
  
  if (result) {
    console.log('[PWA Detection] iOS PWA detected - app installed via "Add to Home Screen"');
  }
  
  return result;
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
 * Uses iframe method to avoid Safari errors when app isn't installed
 * 
 * Note: For widgets to appear, the native iOS app must be installed.
 * This function triggers the native app to create/update widgets.
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
    
    console.log('[PWA] Attempting to trigger native app for widget update:', url);
    
    // Store widget data in localStorage as backup (native app can read this)
    if (data && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('pendingWidgetUpdate', JSON.stringify({
          action,
          ...data,
          timestamp: Date.now(),
        }));
        console.log('[PWA] Widget data stored in localStorage as backup');
      } catch (e) {
        console.log('[PWA] Could not store widget data in localStorage:', e);
      }
    }
    
    // Use iframe method (silent, no error popup if app isn't installed)
    // This is the recommended method for iOS PWAs
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.visibility = 'hidden';
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
    }, 1000);
    
    console.log('[PWA] URL scheme triggered via iframe - native app should receive deep link');
    return true;
  } catch (error) {
    console.error('[PWA] Error triggering native app:', error);
    return false;
  }
}

