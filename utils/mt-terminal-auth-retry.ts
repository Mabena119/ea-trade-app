/**
 * How many times to remount the MT WebView after a retriable failure
 * (first load + remounts = 1 + MT_TERMINAL_AUTH_REMOUNTS attempts).
 */
export const MT_TERMINAL_AUTH_REMOUNTS = 3;

/**
 * True when failure might clear on retry (slow load, overlay, broker flake).
 * False for clear wrong-credentials or missing saved MT5 config.
 */
export function isRetriableTerminalAuthFailure(message: string): boolean {
  const m = (message || '').toLowerCase();
  if (
    m.includes('invalid login') ||
    m.includes('invalid password') ||
    m.includes('wrong password') ||
    m.includes('wrong login') ||
    m.includes('incorrect password') ||
    m.includes('incorrect login') ||
    m.includes('verify credentials') ||
    m.includes('not configured') ||
    m.includes('login and password are required')
  ) {
    return false;
  }
  return true;
}
