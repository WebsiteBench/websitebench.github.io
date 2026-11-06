// Called by tools/prerender.js with one JSON argument, [{slug, reference, rebuild, model}]; paths are relative to the repository root.
// Renders tools/task-og.html to assets/og/<slug>.png (1200 x 630).
const path = require('node:path'), fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT || 'playwright');
const root = path.join(__dirname, '..'), cards = JSON.parse(process.argv[2]);
(async () => {
  const browser = await chromium.launch({args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})});
  const page = await browser.newPage({viewport: {width: 1200, height: 630}});
  await page.goto('file://' + path.join(__dirname, 'task-og.html'));
  fs.mkdirSync(path.join(root, 'assets/og'), {recursive: true});
  for (const card of cards) {
    await page.evaluate(async ({reference, rebuild, model}) => {
      document.querySelector('#model').textContent = model;
      for (const [id, src] of [['reference', reference], ['rebuild', rebuild]]) {
        const img = document.querySelector('#' + id);
        img.src = src;
        await img.decode();
      }
      await document.fonts.ready;
    }, {reference: 'file://' + path.join(root, card.reference), rebuild: 'file://' + path.join(root, card.rebuild), model: card.model});
    await page.screenshot({path: path.join(root, 'assets/og', card.slug + '.png')});
  }
  await browser.close();
  console.log(`wrote ${cards.length} cards to assets/og`);
})();
