// Usage: serve the repo (python3 -m http.server 8000), then `node tools/prerender.js`.
// Copies the markup that site.js generates for static containers back into index.html,
// so the leaderboard and charts exist without JavaScript. site.js still re-renders them on load.
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000/';
const FILE = path.join(__dirname, '..', 'index.html');
const IDS = ['board-body', 'gbars', 'waffle', 'wf-grid', 'corpus', 'dt-list'];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const got = await p.evaluate(ids => {
    const o = {}; ids.forEach(id => { o[id] = document.getElementById(id).innerHTML.replace(/\s*\n\s*/g, ''); });
    o.ev = {}; document.querySelectorAll('[data-ev]').forEach(el => { o.ev[el.dataset.ev] = el.innerHTML.replace(/\s*\n\s*/g, ''); });
    return o;
  }, IDS);
  await b.close();
  let html = fs.readFileSync(FILE, 'utf8');
  for (const id of IDS) {
    // Replace the container's content. After the first run an end marker makes nested markup safe to replace.
    const marked = html.includes(`<!--/${id}-->`);
    const re = marked
      ? new RegExp(`(<(\\w+)[^>]*\\sid="${id}"[^>]*>)[\\s\\S]*?</\\2><!--/${id}-->`)
      : new RegExp(`(<(\\w+)[^>]*\\sid="${id}"[^>]*>)</\\2>`);
    if (!re.test(html)) { console.log('not found', id); continue; }
    html = html.replace(re, (m0, open, tag) => `${open}${got[id]}</${tag}><!--/${id}-->`);
  }
  for (const [k, v] of Object.entries(got.ev)) {
    const marked = html.includes(`<!--/ev-${k}-->`);
    const re = marked
      ? new RegExp(`(<div class="evidence" data-ev="${k}">)[\\s\\S]*?</div><!--/ev-${k}-->`)
      : new RegExp(`(<div class="evidence" data-ev="${k}">)</div>`);
    html = html.replace(re, (m0, open) => `${open}${v}</div><!--/ev-${k}-->`);
  }
  fs.writeFileSync(FILE, html);
  console.log('prerendered', IDS.map(id => id + ':' + got[id].length).join(' '), 'ev:', Object.keys(got.ev).join(','));
})();
