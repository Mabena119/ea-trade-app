import { Platform } from 'react-native';

/** Iframe WebView used for MT5 broker link on web (MetaTrader tab). */
export const WEBVIEW_SCOPE_MT5_LINK = 'ea-mt5-link';

/** Iframe WebView used for MT5 automated trading / chart warmup (root overlay). */
export const WEBVIEW_SCOPE_MT5_TRADING = 'ea-mt5-trading';

/** Tear down the web iframe registered under this scope (same-origin proxy iframes only). */
export function clearWebTerminalByScope(scopeId: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const w = window as unknown as { __eaWebViewClearByScope?: Record<string, () => void> };
    const fn = w.__eaWebViewClearByScope?.[scopeId];
    if (typeof fn === 'function') fn();
  } catch (e) {
    console.warn('[web-terminal-scope] clear failed', scopeId, e);
  }
}
