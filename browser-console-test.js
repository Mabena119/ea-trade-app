// Copy and paste this entire script into browser console after logging into MT5 terminal
// COMPLETE APP TRADING SCRIPT TEST - Exact match to app code
(async function executeCompleteTrading() {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const sendMessage = (type, message) => {
    console.log(`[${type}] ${message}`);
  };

  // Trade Configuration (from quotes page)
  const numberOfTrades = 5;
  const volume = '0.01'; // lotSize from config
  const asset = 'BTCUSD';

  // Signal data (from signal)
  const action = 'BUY'; // normalized to uppercase
  const sl = '89000.4';
  const tp = '89543.101';
  const botname = 'AutoTrader';

  console.log('=== COMPLETE APP TRADING SCRIPT TEST ===');
  console.log('Trade Configuration:', { numberOfTrades, volume, asset, action, sl, tp });
  sendMessage('step', 'Starting trading script...');

  // Step 1: Search for symbol
  sendMessage('step', 'Locating BTCUSD symbol...');
  let searchBar = null;
  for (let i = 0; i < 10; i++) {
    searchBar = document.querySelector('input[placeholder="Search symbol"]') ||
      document.querySelector('input[placeholder*="Search symbol" i]') ||
      document.querySelector('input[placeholder*="Search" i]');
    if (searchBar) break;
    await sleep(500);
  }

  if (!searchBar) {
    sendMessage('error', 'Search bar not found');
    return;
  }

  searchBar.focus();
  searchBar.click();
  searchBar.value = '';
  searchBar.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);

  searchBar.value = asset;
  searchBar.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  searchBar.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  await sleep(2500);
  sendMessage('step', 'BTCUSD symbol search completed');

  // Step 2: Select symbol
  sendMessage('step', 'Selecting BTCUSD symbol...');
  let symbolSelected = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const allClickable = document.querySelectorAll('div, span, a, button, li');
    const symbolElements = Array.from(allClickable).filter(el => {
      const text = (el.innerText || el.textContent || '').trim();
      return text === asset || text.includes(asset);
    });

    for (const element of symbolElements) {
      if (element.offsetParent !== null) {
        element.click();
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(500);

        const chartArea = document.querySelector('.chart-container') ||
          document.querySelector('[class*="chart"]') ||
          document.querySelector('canvas');
        if (chartArea) {
          symbolSelected = true;
          sendMessage('step', 'BTCUSD symbol selected successfully - chart opened');
          break;
        }
      }
    }
    if (symbolSelected) break;
    await sleep(500);
  }

  if (!symbolSelected) {
    sendMessage('error', 'Could not select BTCUSD symbol');
    return;
  }

  // Step 3: Wait for chart
  await sleep(4000);
  let chartReady = false;
  for (let i = 0; i < 10; i++) {
    const chartArea = document.querySelector('.chart-container') ||
      document.querySelector('[class*="chart"]') ||
      document.querySelector('canvas');
    if (chartArea && chartArea.offsetParent !== null) {
      chartReady = true;
      break;
    }
    await sleep(500);
  }
  await sleep(2000);

  // Step 4: Execute trades
  sendMessage('step', 'Executing trades according to trade configuration...');
  const numTrades = numberOfTrades;
  let successfulTrades = 0;
  let failedTrades = 0;

  console.log(`MT5: Executing EXACTLY ${numTrades} trades for ${asset} (lot size: ${volume}, action: ${action})`);
  sendMessage('step', `Trade Configuration: ${numTrades} trade(s), Lot Size: ${volume}, Action: ${action}, SL: ${sl}, TP: ${tp}`);

  // Execute trades sequentially - loop runs EXACTLY numTrades times
  for (let tradeNum = 0; tradeNum < numTrades; tradeNum++) {
    const currentTrade = tradeNum + 1;
    console.log(`MT5: === TRADE ${currentTrade} OF ${numTrades} START ===`);
    sendMessage('step', `Trade ${currentTrade}/${numTrades}: Opening order dialog...`);

    // Wait for chart/UI to be ready if first trade
    if (tradeNum === 0) {
      await sleep(2000);
    }

    let orderDialogOpen = null;

    // Find order button
    let orderBtn = null;
    for (let waitAttempt = 0; waitAttempt < 20; waitAttempt++) {
      orderBtn = document.querySelector('.icon-button.svelte-1iwf8ix.withText[title*="Trade Form" i]') ||
        document.querySelector('.icon-button.svelte-1iwf8ix.withText[title*="F9" i]') ||
        document.querySelector('.icon-button.svelte-1iwf8ix.withText');

      if (orderBtn && orderBtn.offsetParent !== null) {
        const rect = orderBtn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`MT5: Found order button! Title: ${orderBtn.getAttribute('title') || ''}`);
          break;
        }
      }
      await sleep(500);
    }

    if (orderBtn && orderBtn.offsetParent !== null) {
      console.log('MT5: Clicking order button...');

      const rect = orderBtn.getBoundingClientRect();
      const isInViewport = rect.top >= 0 && rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth);

      if (!isInViewport) {
        orderBtn.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        await sleep(1000);
      } else {
        await sleep(500);
      }

      orderBtn.focus();
      orderBtn.click();
      orderBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      orderBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      orderBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(3000);

      // Check if dialog opened
      for (let checkAttempt = 0; checkAttempt < 10; checkAttempt++) {
        const dialog = document.querySelector('.wrapper.svelte-1mnv5a8') ||
          document.querySelector('[class*="wrapper"][class*="svelte-1mnv5a8"]');

        if (dialog && (dialog.offsetParent !== null || (dialog.style && dialog.style.display !== 'none'))) {
          orderDialogOpen = dialog;
          console.log('MT5: Order dialog opened successfully!');
          break;
        }
        await sleep(500);
      }
    } else {
      console.error('MT5: Order button not found after 20 attempts');
    }

    // Check dialog with comprehensive selectors
    if (!orderDialogOpen) {
      const dialogSelectors = [
        '.wrapper.svelte-1mnv5a8',
        '[class*="wrapper"][class*="svelte-1mnv5a8"]',
        '.modal',
        '[class*="dialog"]',
        '[class*="order"]',
        '.trade-input',
        'input[placeholder*="volume" i]',
        'input[placeholder*="lot" i]',
        'input[name="volume"]'
      ];

      for (const selector of dialogSelectors) {
        const dialog = document.querySelector(selector);
        if (dialog && (dialog.offsetParent !== null || (dialog.style && dialog.style.display !== 'none'))) {
          orderDialogOpen = dialog;
          console.log('MT5: Order dialog found with selector: ' + selector);
          break;
        }
      }
    }

    if (!orderDialogOpen) {
      console.error(`MT5: Order dialog not found for trade ${currentTrade}`);
      sendMessage('error', `Trade ${currentTrade}: Could not open order dialog`);
      failedTrades++;
      continue;
    }

    sendMessage('step', `Trade ${currentTrade}/${numTrades}: Order dialog opened successfully`);
    await sleep(1500);

    // Set parameters
    sendMessage('step', `Trade ${currentTrade}/${numTrades}: Setting trade parameters (Lot: ${volume}, SL: ${sl}, TP: ${tp})...`);

    const setField = (selector, value, name) => {
      const field = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (field) {
        field.focus();
        field.select();
        field.value = '';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));

        setTimeout(() => {
          field.focus();
          field.value = value;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
          field.dispatchEvent(new Event('blur', { bubbles: true }));
          console.log(`MT5: Set ${name} to ${value}`);
        }, 100);
        return true;
      }
      return false;
    };

    // Set Volume
    const volumeLabels = Array.from(document.querySelectorAll('label')).filter(label => {
      const text = (label.textContent || '').trim().toLowerCase();
      return text.includes('volume');
    });
    if (volumeLabels.length > 0) {
      const input = volumeLabels[0].querySelector('input[type="text"]');
      if (input) setField(input, volume, 'Volume');
    }
    await sleep(300);

    // Set Stop Loss
    const slLabels = Array.from(document.querySelectorAll('label')).filter(label => {
      const text = (label.textContent || '').trim().toLowerCase();
      return text.includes('stop loss') || text.includes('s / l');
    });
    if (slLabels.length > 0) {
      const input = slLabels[0].querySelector('input[type="text"]');
      if (input) setField(input, sl, 'Stop Loss');
    }
    await sleep(300);

    // Set Take Profit
    const tpLabels = Array.from(document.querySelectorAll('label')).filter(label => {
      const text = (label.textContent || '').trim().toLowerCase();
      return text.includes('take profit') || text.includes('t / p');
    });
    if (tpLabels.length > 0) {
      const input = tpLabels[0].querySelector('input[type="text"]');
      if (input) setField(input, tp, 'Take Profit');
    }
    await sleep(300);

    // Set Comment
    const allInputs = Array.from(document.querySelectorAll('.wrapper.svelte-1mnv5a8 input[type="text"]'));
    const volumeSlTpLabels = Array.from(document.querySelectorAll('label')).filter(label => {
      const text = (label.textContent || '').trim().toLowerCase();
      return text.includes('volume') || text.includes('stop loss') || text.includes('take profit') || text.includes('s / l') || text.includes('t / p');
    });
    const excludedInputs = new Set();
    volumeSlTpLabels.forEach(label => {
      const input = label.querySelector('input[type="text"]');
      if (input) excludedInputs.add(input);
    });
    const commentInput = allInputs.find(input => !excludedInputs.has(input));
    if (commentInput) {
      setField(commentInput, botname, 'Comment');
    }

    await sleep(1500);
    sendMessage('step', `Trade ${currentTrade}/${numTrades}: Parameters set - Volume: ${volume}, SL: ${sl}, TP: ${tp}`);

    // Execute order
    sendMessage('step', `Trade ${currentTrade}/${numTrades}: Executing ${action} order...`);

    let executeBtn = null;
    if (action === 'BUY') {
      executeBtn = Array.from(document.querySelectorAll('button')).find(btn => {
        const text = (btn.textContent || '').trim().toLowerCase();
        return text.includes('buy by market') || (text.includes('buy') && !text.includes('sell'));
      });
    } else {
      executeBtn = Array.from(document.querySelectorAll('button')).find(btn => {
        const text = (btn.textContent || '').trim().toLowerCase();
        return text.includes('sell by market') || (text.includes('sell') && !text.includes('buy'));
      });
    }

    if (executeBtn) {
      executeBtn.click();
      await sleep(2500);
      console.log(`MT5: Order executed for trade ${currentTrade}`);
      sendMessage('step', `Trade ${currentTrade}/${numTrades}: Order executed, confirming...`);
    } else {
      console.error(`MT5: Execute button not found for trade ${currentTrade}`);
      sendMessage('error', `Trade ${currentTrade}: Execute button not found`);
      failedTrades++;
      continue;
    }

    // Confirm order
    sendMessage('step', `Trade ${currentTrade}/${numTrades}: Confirming order...`);
    await sleep(1000);

    let confirmBtn = Array.from(document.querySelectorAll('button')).find(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      return text === 'ok' || text.includes('ok');
    });

    if (confirmBtn) {
      confirmBtn.click();
      await sleep(2000);
      successfulTrades++;
      console.log(`MT5: Trade ${currentTrade} confirmed successfully`);
      sendMessage('step', `Trade ${currentTrade}/${numTrades}: COMPLETED ✓ (${successfulTrades} successful)`);
    } else {
      failedTrades++;
      console.error(`MT5: Could not confirm trade ${currentTrade}`);
      sendMessage('error', `Trade ${currentTrade}: Confirmation button not found`);
    }

    // Wait between trades (except after last)
    if (tradeNum < numTrades - 1) {
      console.log(`MT5: Trade ${currentTrade}/${numTrades} completed. Progress: ${successfulTrades} successful, ${failedTrades} failed`);
      sendMessage('step', `Trade ${currentTrade} complete - waiting before next trade... (${successfulTrades}/${numTrades} completed)`);
      await sleep(3000);
    }
  }

  // Final summary
  console.log('MT5: === ALL TRADES COMPLETED ===');
  console.log('MT5: Trade Configuration Used:', {
    numberOfTrades: numTrades,
    volume: volume,
    action: action,
    asset: asset,
    sl: sl,
    tp: tp
  });
  console.log('MT5: Results - Successful:', successfulTrades, 'Failed:', failedTrades, 'Target:', numTrades);

  sendMessage('trade_executed', `Trading complete: ${successfulTrades}/${numTrades} successful for ${asset}`);

  if (successfulTrades === numTrades) {
    sendMessage('success', `All ${numTrades} trade(s) executed successfully for ${asset} (Lot Size: ${volume})`);
    console.log('✅ ALL TRADES PLACED SUCCESSFULLY!');
  } else {
    sendMessage('partial', `Trading completed with partial success: ${successfulTrades}/${numTrades}`);
    console.log(`⚠️ Partial success: ${successfulTrades}/${numTrades} trades placed`);
  }
})();
