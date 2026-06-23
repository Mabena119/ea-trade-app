<?php
/**
 * MT5 .ex5 Update Popup for EA Trade Admin Dashboard
 *
 * Drop into admin/home/index.php (or a shared admin footer) right before </body>.
 *
 * RECOMMENDED: Show only right after a successful admin login.
 *
 * In your login handler (after credentials are validated):
 *   $_SESSION['show_mt5_update_popup'] = true;
 *   header('Location: /admin/home/index.php');
 *   exit;
 *
 * Then wrap the include:
 *
 *   <?php if (!empty($_SESSION['show_mt5_update_popup'])) { unset($_SESSION['show_mt5_update_popup']); ?>
 *       <?php include __DIR__ . '/../snippets/mt5-update-toast-embeddable.php'; ?>
 *   <?php } ?>
 *
 * Or include unconditionally on the dashboard — sessionStorage prevents repeat spam per tab.
 */

if (session_status() === PHP_SESSION_NONE) {
  session_start();
}

// Optional: only render when the flash is set (uncomment if you use the pattern above)
// if (empty($_SESSION['show_mt5_update_popup'])) return;
// unset($_SESSION['show_mt5_update_popup']);
?>

<!-- BEGIN MT5 UPDATE POPUP -->
<div id="mt5UpdateOverlay" style="
  position: fixed;
  inset: 0;
  z-index: 999998;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 260ms ease;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
">
  <div id="mt5UpdateModal" role="dialog" aria-modal="true" aria-labelledby="mt5UpdateTitle" style="
    position: relative;
    width: 100%;
    max-width: 440px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 18px;
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.45),
                0 0 0 1px rgba(139, 92, 246, 0.12) inset;
    overflow: hidden;
    transform: scale(0.94) translateY(8px);
    opacity: 0;
    transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1),
                opacity 240ms cubic-bezier(0.32, 0.72, 0, 1);
    will-change: transform, opacity;
  ">
    <div style="
      position: absolute;
      left: 0; right: 0; top: 0;
      height: 3px;
      background: linear-gradient(90deg, #8b5cf6, #a78bfa);
    "></div>

    <button id="mt5PopupClose" aria-label="Dismiss" style="
      position: absolute;
      top: 14px;
      right: 14px;
      width: 32px;
      height: 32px;
      border-radius: 999px;
      border: 0;
      background: rgba(63, 63, 70, 0.65);
      color: #d4d4d8;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
      z-index: 2;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>

    <div style="padding: 28px 24px 20px;">
      <div style="
        width: 52px;
        height: 52px;
        border-radius: 14px;
        background: rgba(139, 92, 246, 0.14);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
      ">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </div>

      <div id="mt5UpdateTitle" style="
        color: #f4f4f5;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.3px;
        line-height: 1.25;
        margin-bottom: 10px;
        padding-right: 28px;
      ">
        Update your MT5 .ex5 file
      </div>

      <div style="
        color: #a1a1aa;
        font-size: 14.5px;
        line-height: 1.55;
        font-weight: 500;
        margin-bottom: 18px;
      ">
        Signals will not work until you replace the Expert Advisor
        (<strong style="color:#e4e4e7;">.ex5</strong>) on MetaTrader 5 and update the EA Trade app.
      </div>

      <ul style="
        margin: 0 0 22px;
        padding: 0 0 0 18px;
        color: #d4d4d8;
        font-size: 13.5px;
        line-height: 1.6;
      ">
        <li style="margin-bottom: 6px;">Download the latest <code style="background:#27272a;padding:2px 6px;border-radius:4px;">.ex5</code> from your admin panel</li>
        <li style="margin-bottom: 6px;">Copy it into MT5 → <em>File → Open Data Folder → MQL5 → Experts</em></li>
        <li>Ask clients to update the EA Trade app from the store</li>
      </ul>

      <button id="mt5PopupOk" type="button" style="
        width: 100%;
        border: 0;
        border-radius: 12px;
        padding: 13px 18px;
        background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%);
        color: #fff;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.15s ease, filter 0.15s ease;
      ">
        Got it
      </button>
    </div>

    <div style="position: relative; height: 3px; background: rgba(63, 63, 70, 0.5);">
      <div id="mt5PopupProgress" style="
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 100%;
        background: linear-gradient(90deg, #8b5cf6, #a78bfa);
        transition: width 15s linear;
        will-change: width;
      "></div>
    </div>
  </div>
</div>

<script>
(function () {
  var overlay = document.getElementById('mt5UpdateOverlay');
  var modal = document.getElementById('mt5UpdateModal');
  var progress = document.getElementById('mt5PopupProgress');
  var closeBtn = document.getElementById('mt5PopupClose');
  var okBtn = document.getElementById('mt5PopupOk');
  if (!overlay || !modal || !progress) return;

  var hideTimer = null;
  var shownThisSession = false;
  var STORAGE_KEY = 'mt5UpdatePopupShown';

  function showPopup() {
    if (shownThisSession || sessionStorage.getItem(STORAGE_KEY)) {
      return;
    }
    shownThisSession = true;
    sessionStorage.setItem(STORAGE_KEY, '1');

    overlay.style.pointerEvents = 'auto';
    void overlay.offsetWidth;
    overlay.style.opacity = '1';
    modal.style.transform = 'scale(1) translateY(0)';
    modal.style.opacity = '1';

    progress.style.transition = 'none';
    progress.style.width = '100%';
    void progress.offsetWidth;
    progress.style.transition = 'width 15s linear';
    progress.style.width = '0%';

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePopup, 15000);
  }

  function hidePopup(animated) {
    if (animated === undefined) animated = true;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    if (!animated) {
      overlay.style.transition = 'none';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      modal.style.transition = 'none';
      modal.style.transform = 'scale(0.94) translateY(8px)';
      modal.style.opacity = '0';
      progress.style.transition = 'none';
      progress.style.width = '100%';
      return;
    }

    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    modal.style.transform = 'scale(0.96) translateY(6px)';
    modal.style.opacity = '0';

    setTimeout(function () {
      overlay.style.transition = 'opacity 260ms ease';
      modal.style.transition = 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 240ms cubic-bezier(0.32, 0.72, 0, 1)';
    }, 260);
  }

  function bindDismiss(el) {
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      hidePopup(true);
    });
  }

  bindDismiss(closeBtn);
  bindDismiss(okBtn);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) hidePopup(true);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.style.opacity === '1') {
      hidePopup(true);
    }
  });

  if (okBtn) {
    okBtn.addEventListener('mouseenter', function () {
      okBtn.style.filter = 'brightness(1.06)';
      okBtn.style.transform = 'translateY(-1px)';
    });
    okBtn.addEventListener('mouseleave', function () {
      okBtn.style.filter = '';
      okBtn.style.transform = '';
    });
  }

  window.showMT5UpdatePopup = showPopup;
  window.hideMT5UpdatePopup = hidePopup;

  setTimeout(showPopup, 420);
})();
</script>
<!-- END MT5 UPDATE POPUP -->
