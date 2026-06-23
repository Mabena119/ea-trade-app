/**
 * MT5 web-terminal broker URLs and server-name normalization.
 * JustMarkets terminals use Cloudflare — see needsMt5SessionPersistence().
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
  'JustMarketsSC-Live': 'https://live.justmarkets.com/terminal',
  'JustMarketsSC-Live2': 'https://live2.justmarkets.com/terminal',
  'JustMarketsSC-Demo': 'https://demo.justmarkets.com/terminal',
  'JustMarketsSC-Demo2': 'https://demo2.justmarkets.com/terminal',
  'JPMarkets-Live': 'https://web.jpmarkets.co.za/terminal',
};

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
  'justmarketsc-live2': 'JustMarketsSC-Live2',
  'justmarketsc-live': 'JustMarketsSC-Live',
  'justmarketsc-demo2': 'JustMarketsSC-Demo2',
  'justmarketsc-demo': 'JustMarketsSC-Demo',
};

export const MT5_BROKERS = Object.keys(MT5_BROKER_URLS);

export function normalizeMt5ServerKey(server: string): string {
  const trimmed = (server || '').trim();
  if (!trimmed) return '';
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

/** JustMarkets web terminals sit behind Cloudflare — WebView must keep cookies/cache. */
export function needsMt5SessionPersistence(server: string): boolean {
  const url = resolveMt5TerminalUrl(server).toLowerCase();
  return url.includes('justmarkets.com');
}

/** Delay before injecting trading auth script after WebView load (Cloudflare needs longer). */
export function getMt5ShellReadyDelayMs(server: string, isAndroid: boolean): number {
  if (needsMt5SessionPersistence(server)) {
    return isAndroid ? 11000 : 7500;
  }
  return isAndroid ? 4800 : 3200;
}

export function getMt5InnerAuthKickMs(server: string, isAndroid: boolean): number {
  if (needsMt5SessionPersistence(server)) {
    return isAndroid ? 4000 : 2500;
  }
  return isAndroid ? 1200 : 450;
}

export function getMt5InnerAuthFallbackMs(server: string, isAndroid: boolean): number {
  if (needsMt5SessionPersistence(server)) {
    return isAndroid ? 14000 : 10000;
  }
  return isAndroid ? 5600 : 3200;
}

/** Injected before page load — skip storage wipe for Cloudflare-protected brokers. */
export function getMt5WebViewBootstrapJs(preserveSession: boolean): string {
  if (preserveSession) {
    return `
(function(){
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'webview_ready' }));
  } catch(e) {}
})();
true;
`;
  }
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
    bt.indexOf('JustMarkets') >= 0;
}
function overlayHasBrokerAccountsText(txt) {
  return txt.indexOf('Trading accounts') >= 0 ||
    txt.indexOf('Razor Markets') >= 0 ||
    txt.indexOf('Just Markets') >= 0 ||
    txt.indexOf('JustMarkets') >= 0;
}
`;

/** Wait for Cloudflare challenge to finish before login automation. */
export const MT5_WAIT_PAST_CLOUDFLARE_JS = `
async function waitPastCloudflare(sendMessage, sleep, isTerminalSessionVisible) {
  sendMessage('step_update', 'Loading broker terminal...');
  var deadline = Date.now() + 90000;
  var lastMsg = '';
  while (Date.now() < deadline) {
    var title = (document.title || '').toLowerCase();
    var html = (document.documentElement && document.documentElement.innerHTML) ? document.documentElement.innerHTML : '';
    var body = (document.body && document.body.innerText) ? document.body.innerText : '';
    var onCf = title.indexOf('just a moment') >= 0 ||
      title.indexOf('attention required') >= 0 ||
      html.indexOf('challenges.cloudflare.com') >= 0 ||
      html.indexOf('cf-challenge') >= 0 ||
      html.indexOf('cdn-cgi/challenge') >= 0 ||
      html.indexOf('cf-browser-verification') >= 0 ||
      html.indexOf('turnstile') >= 0 ||
      body.indexOf('Enable JavaScript and cookies') >= 0 ||
      body.indexOf('Verify you are human') >= 0 ||
      body.indexOf('security check') >= 0;
    var hasForm = document.querySelector('input[name="login"]') ||
      document.querySelector('input[type="password"]') ||
      document.querySelector('input[name="server"]') ||
      document.querySelector('#disclaimer') ||
      document.querySelector('.accept-button') ||
      document.querySelector('.form');
    if (!onCf && (hasForm || isTerminalSessionVisible())) {
      sendMessage('step_update', 'Terminal ready');
      return true;
    }
    var msg = onCf ? 'Waiting for security check...' : 'Loading broker terminal...';
    if (msg !== lastMsg) {
      sendMessage('step_update', msg);
      lastMsg = msg;
    }
    await sleep(1600);
  }
  sendMessage('authentication_failed', 'Broker security check timed out — try Link Account again');
  return false;
}
`;
