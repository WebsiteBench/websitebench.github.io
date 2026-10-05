// Usage: `node tools/render-og.js` renders tools/og.html to assets/og.png (1200 x 630).
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + path.join(__dirname, 'og.html'), { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.body.dataset.ready === '1');
  await p.screenshot({ path: path.join(__dirname, '..', 'assets', 'og.png') });
  await b.close();
  console.log('wrote assets/og.png');
})();
