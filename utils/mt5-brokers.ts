/**
 * MT5 web-terminal broker URLs and server-name normalization.
 */

export const MT5_BROKER_URLS: Record<string, string> = {
  'RazorMarkets-Live': 'https://webtrader.razormarkets.co.za/terminal/',
  'AccuMarkets-Live': 'https://webterminal.accumarkets.co.za/terminal/',
  'RockWest-Server': 'https://webtrader.rock-west.com/terminal',
  'MaonoGlobalMarkets-Live': 'https://web.maonoglobalmarkets.com/terminal',
  'Deriv-Demo': 'https://mt5-demo-web.deriv.com/terminal',
  'DerivSVG-Server': 'https://mt5-real01-web-svg.deriv.com/terminal',
  'DerivSVG-Server-02': 'https://mt5-real02-web-svg.deriv.com/terminal',
  'DerivSVG-Server-03': 'https://mt5-real03-web-svg.deriv.com/terminal',
  'DerivBVI-Server': 'https://mt5-real01-web-bvi.deriv.com/terminal',
  'DerivBVI-Server-02': 'https://mt5-real02-web-bvi.deriv.com/terminal',
  'DerivBVI-Server-03': 'https://mt5-real03-web-bvi.deriv.com/terminal',
  'DerivBVI-Server-VU': 'https://mt5-real01-web-vu.deriv.com/terminal',
  'DerivBVI-Server-VU-02': 'https://mt5-real02-web-vu.deriv.com/terminal',
  'DerivBVI-Server-VU-03': 'https://mt5-real03-web-vu.deriv.com/terminal',
  'RocketX-Live': 'https://webtrader.rocketx.io:1950/terminal',
  'Profinwealth-Live': 'https://mt5.profinwealth.com/',
  'XMGlobal-MT5': 'https://mt5-1.xm-bz.com/terminal?lang=en',
  'XMGlobal-MT5 2': 'https://mt5-2.xm-bz.com/terminal?lang=en',
  'XMGlobal-MT5 4': 'https://mt5-4.xm-bz.com/terminal?lang=en',
  'XMGlobal-MT5 5': 'https://mt5-5.xm-bz.com/terminal?lang=en',
  'PXBTTrading-1': 'https://mt5.primexbt.com/terminal',
  'Exness-MT5Real': 'https://mt5real.exwebterm.com/terminal',
  'Exness-MT5Real2': 'https://mt5real2.exwebterm.com/terminal',
  'Exness-MT5Real3': 'https://mt5real3.exwebterm.com/terminal',
  'Exness-MT5Real4': 'https://mt5real4.exwebterm.com/terminal',
  'Exness-MT5Real5': 'https://mt5real5.exwebterm.com/terminal',
  'Exness-MT5Real6': 'https://mt5real6.exwebterm.com/terminal',
  'Exness-MT5Real7': 'https://mt5real7.exwebterm.com/terminal',
  'Exness-MT5Real8': 'https://mt5real8.exwebterm.com/terminal',
  'Exness-MT5Real9': 'https://mt5real9.exwebterm.com/terminal',
  'Exness-MT5Real10': 'https://mt5real10.exwebterm.com/terminal',
  'Exness-MT5Real11': 'https://mt5real11.exwebterm.com/terminal',
  'Exness-MT5Real12': 'https://mt5real12.exwebterm.com/terminal',
  'Exness-MT5Real15': 'https://mt5real15.exwebterm.com/terminal',
  'Exness-MT5Real17': 'https://mt5real17.exwebterm.com/terminal',
  'Exness-MT5Real18': 'https://mt5real18.exwebterm.com/terminal',
  'Exness-MT5Real19': 'https://mt5real19.exwebterm.com/terminal',
  'Exness-MT5Real20': 'https://mt5real20.exwebterm.com/terminal',
  'Exness-MT5Real21': 'https://mt5real21.exwebterm.com/terminal',
  'Exness-MT5Real22': 'https://mt5real22.exwebterm.com/terminal',
  'Exness-MT5Real23': 'https://mt5real23.exwebterm.com/terminal',
  'Exness-MT5Real24': 'https://mt5real24.exwebterm.com/terminal',
  'Weltrade-Real': 'https://mt5.real.weltrade.com/terminal',
  'Weltrade-Demo': 'https://mt5.demo.weltrade.com/terminal',
  'JustMarkets-Live': 'https://live.justmarkets.com/terminal',
  'JustMarkets-Live2': 'https://live2.justmarkets.com/terminal',
  'JustMarkets-Demo': 'https://demo.justmarkets.com/terminal',
  'JustMarkets-Demo2': 'https://demo2.justmarkets.com/terminal',
  'JPMarkets-Live': 'https://web.jpmarkets.co.za/terminal',
};

/** Picker list: one entry per terminal URL (no JustMarketsSC duplicates). */
export const MT5_BROKERS = (() => {
  const seenUrls = new Set<string>();
  const list: string[] = [];
  for (const key of Object.keys(MT5_BROKER_URLS)) {
    const url = MT5_BROKER_URLS[key];
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    list.push(key);
  }
  return list;
})();

/** User-typed or MT5-desktop shorthand → canonical broker key */
const MT5_SERVER_ALIASES: Record<string, string> = {
  live2: 'JustMarkets-Live2',
  live: 'JustMarkets-Live',
  demo2: 'JustMarkets-Demo2',
  demo: 'JustMarkets-Demo',
  'justmarkets-live2': 'JustMarkets-Live2',
  'justmarkets-live': 'JustMarkets-Live',
  'justmarkets-demo2': 'JustMarkets-Demo2',
  'justmarkets-demo': 'JustMarkets-Demo',
  'justmarketsc-live2': 'JustMarkets-Live2',
  'justmarketsc-live': 'JustMarkets-Live',
  'justmarketsc-demo2': 'JustMarkets-Demo2',
  'justmarketsc-demo': 'JustMarkets-Demo',
};

export function normalizeMt5ServerKey(server: string): string {
  const trimmed = (server || '').trim();
  if (!trimmed) return '';
  if (/^JustMarketsSC-/i.test(trimmed)) {
    return trimmed.replace(/^JustMarketsSC-/i, 'JustMarkets-');
  }
  if (MT5_BROKER_URLS[trimmed]) return trimmed;

  const compact = trimmed.toLowerCase().replace(/\s+/g, '');
  if (MT5_SERVER_ALIASES[compact]) return MT5_SERVER_ALIASES[compact];

  if (/justmarkets?sc?[-_]?live2/i.test(trimmed)) return 'JustMarkets-Live2';
  if (/justmarkets?sc?[-_]?live(?!2)/i.test(trimmed)) return 'JustMarkets-Live';
  if (/justmarkets?sc?[-_]?demo2/i.test(trimmed)) return 'JustMarkets-Demo2';
  if (/justmarkets?sc?[-_]?demo(?!2)/i.test(trimmed)) return 'JustMarkets-Demo';

  return trimmed;
}

export function resolveMt5TerminalUrl(server: string): string {
  const key = normalizeMt5ServerKey(server);
  return MT5_BROKER_URLS[key] || MT5_BROKER_URLS['RazorMarkets-Live'];
}

/** Brokers whose terminal cannot be server-proxied (Cloudflare blocks fetch → 403). Load direct URL instead. */
export function isMt5ProxyBlockedBroker(server: string): boolean {
  return resolveMt5TerminalUrl(server).toLowerCase().includes('justmarkets.com');
}

/** Link/trade WebView URL: proxy on web for normal brokers; direct terminal URL when proxy would 403. */
export function resolveMt5LinkWebViewUrl(
  server: string,
  platformOs: string,
  proxyPath: string
): string {
  const terminalUrl = resolveMt5TerminalUrl(server);
  if (platformOs !== 'web' || isMt5ProxyBlockedBroker(server)) {
    return terminalUrl;
  }
  return proxyPath;
}

/** HTML redirect when server-side proxy fetch is blocked (web fallback). */
export function mt5CloudflareDirectLoadHtml(terminalUrl: string): string {
  const safe = JSON.stringify(terminalUrl);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${terminalUrl.replace(/"/g, '&quot;')}">
</head><body style="margin:0;background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif;padding:16px">
<p>Opening broker terminal…</p>
<script>try{location.replace(${safe});}catch(e){location.href=${safe};}</script>
</body></html>`;
}

/** Delay before injecting auth script after WebView load. */
export function getMt5ShellReadyDelayMs(_server: string, isAndroid: boolean): number {
  return isAndroid ? 4800 : 3200;
}

export function getMt5InnerAuthKickMs(_server: string, isAndroid: boolean): number {
  return isAndroid ? 1200 : 450;
}

export function getMt5InnerAuthFallbackMs(_server: string, isAndroid: boolean): number {
  return isAndroid ? 5600 : 3200;
}

/** Injected before page load in native MT5 WebViews. */
export function getMt5WebViewBootstrapJs(): string {
  return `
(function(){
  try { localStorage.clear(); } catch(e) {}
  try { sessionStorage.clear(); } catch(e) {}
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      indexedDB.databases().then(function(dbs){
        dbs.forEach(function(db){ if (db.name) try { indexedDB.deleteDatabase(db.name); } catch(e2) {} });
      });
    }
  } catch(e) {}
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      document.cookie.split(';').forEach(function(c){
        var eq = c.indexOf('=');
        var name = eq > -1 ? c.substr(0, eq) : c;
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      });
    }
  } catch(e) {}
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'webview_ready' }));
  } catch(e) {}
})();
true;
`;
}

/** JS snippet inlined in MT5 link/trade auth scripts (broker account drawer detection). */
export const MT5_BROKER_SHEET_MARKERS_JS = `
function pageHasBrokerAccountsSheet(bt) {
  return bt.indexOf('Trading accounts') >= 0 ||
    bt.indexOf('Razor Markets') >= 0 ||
    bt.indexOf('Just Markets') >= 0 ||
    bt.indexOf('JustMarkets') >= 0 ||
    bt.indexOf('Just Global Markets') >= 0;
}
function overlayHasBrokerAccountsText(txt) {
  return txt.indexOf('Trading accounts') >= 0 ||
    txt.indexOf('Razor Markets') >= 0 ||
    txt.indexOf('Just Markets') >= 0 ||
    txt.indexOf('JustMarkets') >= 0 ||
    txt.indexOf('Just Global Markets') >= 0;
}
`;

/** Shared login/password field discovery (JustMarkets uses placeholder-only inputs). */
export const MT5_FORM_INPUT_HELPERS_JS = `
function mt5WalkDocs(scan) {
  try {
    if (scan(document)) return true;
  } catch (e0) {}
  var iframes = document.querySelectorAll('iframe');
  for (var fi = 0; fi < iframes.length; fi++) {
    try {
      var idoc = iframes[fi].contentDocument;
      if (idoc && scan(idoc)) return true;
    } catch (eIf) {}
  }
  return false;
}
function mt5QueryInDocs(selector) {
  var found = null;
  mt5WalkDocs(function(doc) {
    var el = doc.querySelector(selector);
    if (el) { found = el; return true; }
    return false;
  });
  return found;
}
function mt5QueryAllInDocs(selector) {
  var out = [];
  mt5WalkDocs(function(doc) {
    var list = doc.querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    return false;
  });
  return out;
}
function findMt5LoginInput() {
  var selectors = [
    'input[name="login"]',
    'input[name="Login"]',
    'input[placeholder*="Enter Login" i]',
    'input[placeholder*="login" i]',
    'input[type="number"]',
    'input#login'
  ];
  for (var si = 0; si < selectors.length; si++) {
    var el = mt5QueryInDocs(selectors[si]);
    if (el && mt5InputVisible(el)) return el;
  }
  var all = mt5QueryAllInDocs('input');
  for (var i = 0; i < all.length; i++) {
    var inp = all[i];
    var ph = ((inp.getAttribute && inp.getAttribute('placeholder')) || '').toLowerCase();
    var ty = ((inp.type || '') + '').toLowerCase();
    if (ty === 'password') continue;
    if (ph.indexOf('login') >= 0 || (ty === 'number' && ph.indexOf('password') < 0)) {
      if (mt5InputVisible(inp)) return inp;
    }
  }
  return mt5QueryInDocs('input[placeholder*="Enter Login" i]') ||
    mt5QueryInDocs('input[placeholder*="login" i]') ||
    mt5QueryInDocs('input[name="login"]');
}
function findMt5PasswordInput() {
  var selectors = [
    'input[name="password"]',
    'input[type="password"]',
    'input[placeholder*="Enter Password" i]',
    'input[placeholder*="password" i]',
    'input#password'
  ];
  for (var si = 0; si < selectors.length; si++) {
    var el = mt5QueryInDocs(selectors[si]);
    if (el && mt5InputVisible(el)) return el;
  }
  var all = mt5QueryAllInDocs('input');
  for (var i = 0; i < all.length; i++) {
    var inp = all[i];
    var ph = ((inp.getAttribute && inp.getAttribute('placeholder')) || '').toLowerCase();
    var ty = ((inp.type || '') + '').toLowerCase();
    if (ty === 'password' || ph.indexOf('password') >= 0) {
      if (mt5InputVisible(inp)) return inp;
    }
  }
  return mt5QueryInDocs('input[type="password"]') ||
    mt5QueryInDocs('input[placeholder*="Enter Password" i]');
}
function mt5InputVisible(el) {
  if (!el) return false;
  try {
    var st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity || '1') < 0.05) return false;
    var r = el.getBoundingClientRect();
    return r.width > 6 && r.height > 6;
  } catch (e) { return true; }
}
function connectSheetUiVisible() {
  try {
    var loginIn = findMt5LoginInput();
    var pwdIn = findMt5PasswordInput();
    if (mt5InputVisible(loginIn) && mt5InputVisible(pwdIn)) return true;
    var bt = '';
    mt5WalkDocs(function(doc) {
      if (doc.body) bt += (doc.body.innerText || doc.body.textContent || '') + '\\n';
      return false;
    });
    if (bt.indexOf('Connect to account') < 0) return false;
    return pageHasBrokerAccountsSheet(bt) ||
      bt.indexOf('Enter Login') >= 0 ||
      bt.indexOf('Enter Password') >= 0;
  } catch (e) { return false; }
}
function mt5LoginFormReady() {
  return mt5InputVisible(findMt5LoginInput()) && mt5InputVisible(findMt5PasswordInput());
}
function isConnectToAccountSheetOpen() {
  try {
    if (!connectSheetUiVisible()) return false;
    return mt5LoginFormReady();
  } catch (e) { return false; }
}
function mt5SetInputValue(el, val) {
  if (!el || val == null || val === '') return;
  try {
    el.focus();
    try { el.click(); } catch (eC) {}
    var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    nativeSetter = nativeSetter && nativeSetter.set;
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (nativeSetter) nativeSetter.call(el, String(val));
    else el.value = String(val);
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(val) }));
    } catch (eIn) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  } catch (e) {}
}
`;

/** Wait for terminal shell — proceed as soon as login form or session is visible. */
export const MT5_TERMINAL_READY_WAIT_JS = `
async function waitPastCloudflare(sendMessage, sleep, isTerminalSessionVisible) {
  sendMessage('step_update', 'Loading broker terminal...');
  var deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (isTerminalSessionVisible() || mt5LoginFormReady() || connectSheetUiVisible()) {
      sendMessage('step_update', connectSheetUiVisible() ? 'Connect form ready' : 'Terminal ready');
      return true;
    }
    await sleep(800);
  }
  await sleep(1500);
  if (isTerminalSessionVisible() || mt5LoginFormReady() || connectSheetUiVisible()) {
    sendMessage('step_update', connectSheetUiVisible() ? 'Connect form ready' : 'Terminal ready');
    return true;
  }
  sendMessage('authentication_failed', 'Terminal did not load in time — try again');
  return false;
}
`;

/** @deprecated use MT5_TERMINAL_READY_WAIT_JS */
export const MT5_WAIT_PAST_CLOUDFLARE_JS = MT5_TERMINAL_READY_WAIT_JS;
