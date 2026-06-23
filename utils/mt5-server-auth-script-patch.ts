import { MT5_BROKER_SHEET_MARKERS_JS, MT5_TERMINAL_READY_WAIT_JS } from './mt5-brokers';

/**
 * Patches duplicated MT5 auth/trading inline scripts in server.ts for JustMarkets + Cloudflare.
 */
export function patchMt5InlineAuthScript(script: string): string {
  if (!script || script.includes('pageHasBrokerAccountsSheet')) {
    return script;
  }

  let s = script;

  s = s.replace(
    /\(bt\.indexOf\('Razor Markets'\) >= 0 && \(bt\.indexOf\('Connect to account'\)/g,
    "(pageHasBrokerAccountsSheet(bt) && (bt.indexOf('Connect to account')"
  );
  s = s.replace(
    /if \(txt\.indexOf\('Trading accounts'\) < 0 && txt\.indexOf\('Razor Markets'\) < 0\) continue;/g,
    "if (txt.indexOf('Trading accounts') < 0 && !overlayHasBrokerAccountsText(txt)) continue;"
  );
  s = s.replace(
    /if \(inner\.indexOf\('Trading accounts'\) >= 0 \|\| inner\.indexOf\('Razor Markets'\) >= 0\) return node;/g,
    "if (inner.indexOf('Trading accounts') >= 0 || overlayHasBrokerAccountsText(inner)) return node;"
  );
  s = s.replace(
    /if \(\(atxt\.indexOf\('Trading accounts'\) >= 0 \|\| atxt\.indexOf\('Razor Markets'\) >= 0\) && atxt\.indexOf\('Connect to account'\)/g,
    "if ((overlayHasBrokerAccountsText(atxt) || atxt.indexOf('Trading accounts') >= 0) && atxt.indexOf('Connect to account')"
  );

  const markerInjection = `${MT5_BROKER_SHEET_MARKERS_JS}\n${MT5_TERMINAL_READY_WAIT_JS}\n              `;
  if (s.includes('const serverCredential = ')) {
    s = s.replace(/const serverCredential = /, `${markerInjection}const serverCredential = `);
  } else if (s.includes('const loginCredential = ')) {
    s = s.replace(/const loginCredential = /, `${markerInjection}const loginCredential = `);
  }

  s = s.replace(
    /sendMessage\('step_update', 'Initializing MT5 Account\.\.\.'\);\s*await sleep\(5500\);/g,
    `sendMessage('step_update', 'Initializing MT5 Account...');
                  if (!(await waitPastCloudflare(sendMessage, sleep, isTerminalSessionVisible))) return;
                  await sleep(2500);`
  );

  s = s.replace(
    /sendMessage\('step_update', 'Initializing MT5 Account\.\.\.'\);\s*\n\s*\/\/ Wait for page to be ready instead of fixed delay/g,
    `sendMessage('step_update', 'Initializing MT5 Account...');
                  if (!(await waitPastCloudflare(sendMessage, sleep, isTerminalSessionVisible))) return;
                  
                  // Wait for page to be ready instead of fixed delay`
  );

  s = s.replace(
    /while \(retries < 10\) \{\s*\n\s*const form = document\.querySelector\('\.form'\);\s*\n\s*const loginField = document\.querySelector\('input\[name="login"\]'\);\s*\n\s*if \(form \|\| loginField\) break;\s*\n\s*await sleep\(300\);/g,
    `while (retries < 40) {
                    const form = document.querySelector('.form');
                    const loginField = document.querySelector('input[name="login"]') ||
                                     document.querySelector('input[name="Login"]') ||
                                     document.querySelector('input[type="number"]');
                    if (form || loginField) break;
                    await sleep(480);`
  );

  if (!s.includes('Server filled')) {
    s = s.replace(
      /sendMessage\('step_update', 'Password filled'\);\s*\n(\s*)\/\/ Wait for fields to be filled/g,
      `sendMessage('step_update', 'Password filled');
$1var serverField = document.querySelector('input[name="server"]') ||
$1  document.getElementById('server') ||
$1  document.querySelector('input[placeholder*="server" i]');
$1if (serverField && serverCredential) {
$1  setInputValueForOverlay(serverField, serverCredential);
$1  sendMessage('step_update', 'Server filled');
$1  await sleep(400);
$1}
$1
$1// Wait for fields to be filled`
    );

    s = s.replace(
      /sendMessage\('step_update', 'Password filled'\);\s*\n(\s*)await sleep\(1500\);/g,
      `sendMessage('step_update', 'Password filled');
$1var serverField = document.querySelector('input[name="server"]') ||
$1  document.getElementById('server') ||
$1  document.querySelector('input[placeholder*="server" i]');
$1if (serverField && serverCredential) {
$1  setInputValue(serverField, serverCredential);
$1  sendMessage('step_update', 'Server filled');
$1  await sleep(400);
$1}
$1
$1await sleep(1500);`
    );
  }

  if (!s.includes('Login modal: filled login')) {
    s = s.replace(
      /try \{\s*\n(\s*)hideTradingAccountsOverlayIfPresent\(\);\s*\n(\s*)\} catch \(eT\) \{\}\s*\n(\s*)try \{\s*\n(\s*)if \(passwordCredential && isAnyLoginModalBlocking\(\)\) \{/g,
      `try {
$1hideTradingAccountsOverlayIfPresent();
$2} catch (eT) {}
$3try {
$4if (isAnyLoginModalBlocking()) {
$4  if (loginCredential) {
$4    const loginIn = document.querySelector('input[name="login"]') ||
$4      document.querySelector('input[type="number"]') ||
$4      document.querySelector('input#login');
$4    if (loginIn && (!loginIn.value || String(loginIn.value).trim() === '')) {
$4      setInputValueForOverlay(loginIn, loginCredential);
$4      sendMessage('step_update', 'Login modal: filled login');
$4      await sleep(350);
$4    }
$4    if (serverCredential) {
$4      const serverIn = document.querySelector('input[name="server"]') ||
$4        document.getElementById('server') ||
$4        document.querySelector('input[placeholder*="server" i]');
$4      if (serverIn && (!serverIn.value || String(serverIn.value).trim() === '')) {
$4        setInputValueForOverlay(serverIn, serverCredential);
$4        sendMessage('step_update', 'Login modal: filled server');
$4        await sleep(350);
$4      }
$4    }
$4  }
$4}
$4if (passwordCredential && isAnyLoginModalBlocking()) {`
    );

    s = s.replace(
      /try \{\s*\n(\s*)hideTradingAccountsOverlayIfPresent\(\);\s*\n(\s*)\} catch \(eT\) \{\}\s*\n(\s*)try \{\s*\n(\s*)if \(pw && isAnyLoginModalBlocking\(\)\) \{/g,
      `try {
$1hideTradingAccountsOverlayIfPresent();
$2} catch (eT) {}
$3try {
$4if (isAnyLoginModalBlocking()) {
$4  if (loginCredential) {
$4    var loginIn = document.querySelector('input[name="login"]') ||
$4      document.querySelector('input[type="number"]') ||
$4      document.querySelector('input#login');
$4    if (loginIn && (!loginIn.value || String(loginIn.value).trim() === '')) {
$4      setInputValueForOverlay(loginIn, loginCredential);
$4      sendMessage('step_update', 'Login modal: filled login');
$4      await new Promise(function(r) { setTimeout(r, 350); });
$4    }
$4    if (serverCredential) {
$4      var serverIn = document.querySelector('input[name="server"]') ||
$4        document.getElementById('server') ||
$4        document.querySelector('input[placeholder*="server" i]');
$4      if (serverIn && (!serverIn.value || String(serverIn.value).trim() === '')) {
$4        setInputValueForOverlay(serverIn, serverCredential);
$4        sendMessage('step_update', 'Login modal: filled server');
$4        await new Promise(function(r) { setTimeout(r, 350); });
$4      }
$4    }
$4  }
$4}
$4if (pw && isAnyLoginModalBlocking()) {`
    );
  }

  return s;
}
