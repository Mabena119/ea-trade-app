#!/usr/bin/env bun
/**
 * Test the /api/analyze-chart endpoint with a screenshot
 * Usage: bun run scripts/test-analyze-chart.ts [image-path]
 */

const IMAGE_PATH =
  process.argv[2] ||
  '/Users/justvino__/.cursor/projects/Users-justvino-Desktop-expo-ea-trade-app/assets/Simulator_Screenshot_-_iPhone_15_Pro_-_2026-03-20_at_12.44.35-9673beb8-8b79-4f37-82ba-beb9ac71bce8.png';
const API_URL = process.env.API_URL || 'https://ea-trade-app.onrender.com/api/analyze-chart';

async function main() {
  const fs = await import('fs');
  const path = await import('path');

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error('Image not found:', IMAGE_PATH);
    process.exit(1);
  }

  const buf = fs.readFileSync(IMAGE_PATH);
  const base64 = buf.toString('base64');
  const ext = path.extname(IMAGE_PATH).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  console.log('Image size:', (base64.length / 1024).toFixed(1), 'KB base64');
  if (base64.length > 1_000_000) {
    console.warn('Warning: Image exceeds 1MB limit');
  }

  console.log('Calling', API_URL, '...');
  const start = Date.now();

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mimeType }),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('Status:', res.status, '| Time:', elapsed, 's');

    const data = await res.json();
    if (data.message === 'accept' && data.data) {
      const d = data.data;
      console.log('\n--- RESULT ---');
      console.log('Signal:', d.signal);
      console.log('Confidence:', d.confidence);
      console.log('Summary:', d.summary);
      console.log('Reasoning:', d.reasoning);
      console.log('Suggestion:', d.suggestion);
      if (d.entryPrice) console.log('Entry:', d.entryPrice);
      if (d.stopLoss) console.log('Stop Loss:', d.stopLoss);
      if (d.takeProfit1) console.log('TP 1:', d.takeProfit1);
      if (d.takeProfit2) console.log('TP 2:', d.takeProfit2);
      if (d.takeProfit3) console.log('TP 3:', d.takeProfit3);
    } else {
      console.log('Error:', data.error || data);
    }
  } catch (e) {
    console.error('Request failed:', e);
    process.exit(1);
  }
}

main();
