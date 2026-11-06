// Usage: `node tools/render-og.js` renders tools/og.html to assets/og.png (1200 x 630).
const path = require('path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const b = await chromium.launch({ignoreDefaultArgs:['--enable-features=CDPScreenshotNewSurface'],args:['--no-sandbox'],...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + path.join(__dirname, 'og.html'), { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.body.dataset.ready === '1');
  const cohort = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/cohort.json'),'utf8'));
  const models = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/leaderboard.json'),'utf8'));
  await p.evaluate(({tasks,best})=>{document.querySelector('#og-task-count').textContent=tasks;document.querySelector('#og-best-score').textContent=best.toFixed(1)+'%';},{tasks:cohort.tasks.length,best:Math.max(...models.map(m=>m.overall))});
  await p.screenshot({ path: path.join(__dirname, '..', 'assets', 'og.png') });
  await b.close();
  console.log('wrote assets/og.png');
})();
