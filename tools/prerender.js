// Write the leaderboard, inline data, headline numbers and citation into the static pages, so they work without JavaScript.
// Run after any change to data/ or CITATION.bib: node tools/prerender.js
const fs = require('node:fs'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {renderRows} = require('../assets/js/leaderboard-view.js');
const tasksView = require('../assets/js/tasks-view.js');
const {faqItems, plain, html: faqHtml} = require('./faq.js');
const agents = require('./agents.js');
const root = path.join(__dirname, '..'), read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const cohort = read('cohort.json'), waffle = read('waffle.json'), board = read('leaderboard-views.json'), materials = read('task-materials.json');
const ids = cohort.tasks.map(t => t.id), modelIDs = waffle.models.map(m => m.id), same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
if (ids.length !== 70 || new Set(ids).size !== 70 || !same(ids, waffle.tasks.map(t => t.id)) || !same(ids, materials.tasks.map(t => t.id))) throw Error('Current views must share the exact 70-task cohort');
if (modelIDs.length !== 8 || new Set(modelIDs).size !== 8) throw Error('Expected the eight leaderboard models');
for (const model of board.models) {
  const entries = waffle.tasks.map(t => t.results[model.id]).filter(e => e.status === 'scored');
  const passed = entries.reduce((n, e) => n + e.passed, 0), total = entries.reduce((n, e) => n + e.total, 0);
  if (Math.abs(model.overall - 100 * passed / total) > 1e-9 || model.score_counts.overall.passed !== passed || model.score_counts.overall.total !== total) throw Error('Leaderboard and Waffle test counts disagree');
}

// Headline numbers. A task's hidden test count is the total used by most of its scored results.
const caseCount = task => {
  const counts = new Map();
  for (const e of Object.values(task.results)) if (e.status === 'scored') counts.set(e.total, (counts.get(e.total) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
};
const tests = waffle.tasks.reduce((n, t) => n + caseCount(t), 0), perTask = waffle.tasks.map(caseCount);
const ranked = board.models, best = ranked.reduce((a, b) => (b.overall > a.overall ? b : a));
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const oneIn = Math.round(100 / best.overall);
const demo = read('demo-task.json');
const demoPassed = test => test.functional && (test.ssim === undefined || test.ssim >= demo.threshold);
const demoCount = n => n.toLocaleString('en-US');
const facts = {
  tasks: String(ids.length),
  models: String(modelIDs.length),
  tests: tests.toLocaleString('en-US'),
  'tests-per-task': (Math.round(tests / ids.length / 10) * 10).toLocaleString('en-US'),
  'tests-min': Math.min(...perTask).toLocaleString('en-US'),
  'tests-max': Math.max(...perTask).toLocaleString('en-US'),
  'best-model': best.name,
  'best-overall': best.overall.toFixed(1) + '%',
  'best-turns': best.turns.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1}),
  'one-in': words[oneIn] || String(oneIn),
  'demo-model': demo.model,
  'demo-run-passed': demoCount(demo.run.passed),
  'demo-run-total': demoCount(demo.run.total),
  'demo-run-score': (100 * demo.run.passed / demo.run.total).toFixed(1) + '%',
  'demo-run-request': demo.run.groups.request.join('/'),
  'demo-run-browser': demo.run.groups.browser.join('/'),
  'demo-run-system': demo.run.groups.system.join('/'),
  'demo-shown': String(demo.tests.length),
};

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pageFiles = ['index.html', 'run.html', 'eval.html', 'analysis.html'];
const pages = Object.fromEntries(pageFiles.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const inject = (marker, value) => {
  const hits = pageFiles.filter(file => marker.test(pages[file]));
  if (!hits.length) throw Error('Generated content marker missing: ' + marker);
  hits.forEach(file => { pages[file] = pages[file].replace(marker, (_, start, end) => start + value + end); });
};
inject(/(<tbody id="board-body">)[\s\S]*?(<\/tbody><!--\/board-body-->)/, '\n' + renderRows(ranked) + '\n');
for (const [id, data] of [['waffle-data', waffle], ['leaderboard-data', board]]) inject(new RegExp(`(<script type="application/json" id="${id}">)[\\s\\S]*?(<\\/script><!--\\/${id}-->)`), JSON.stringify(data).replace(/</g, '\\u003c'));
inject(/(<pre[^>]*id="bibtex"[^>]*><code>)[\s\S]*?(<\/code><\/pre>)/, escape(fs.readFileSync(path.join(root, 'CITATION.bib'), 'utf8').trim()));

// The task demo: its page tabs, hidden test rows, score and inline data follow data/demo-task.json.
const DEMO_ICON = {
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bad: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
};
const demoMarker = test => demo.markers.find(m => m.test === test.id);
const demoRow = test => {
  const ok = demoPassed(test), marker = demoMarker(test);
  const chip = marker ? `<i class="dt-n" aria-hidden="true">${marker.n}</i>` : '';
  const text = test.page ? `<button class="dt-go" type="button" data-page="${test.page}">${chip}${escape(test.text)}</button>` : escape(test.text);
  return `<li class="dt-row ${ok ? 'ok' : 'bad'}" data-test="${test.id}"><span class="dt-ico" aria-hidden="true">${ok ? DEMO_ICON.ok : DEMO_ICON.bad}</span><span class="dt-group">${escape(test.group)}</span><span class="dt-text"><span class="sr-only">${ok ? 'Passed. ' : 'Failed. '}</span>${text}</span><span class="dt-detail">${test.detail.split(', ').map((part, i) => (i ? `<span class="dt-more">, ${escape(part)}</span>` : escape(part))).join('')}</span></li>`;
};
inject(/(<ul class="dt-list" id="dt-list"[^>]*>)[\s\S]*?(<\/ul><!--\/dt-list-->)/, demo.tests.map(demoRow).join(''));
inject(/(<div class="tabs demo-tabs" id="demo-tabs"[^>]*>)[\s\S]*?(<\/div><!--\/demo-tabs-->)/, demo.pages.map((p, i) => `<button class="tab" type="button" role="tab" id="demo-tab-${p.id}" data-page="${p.id}" aria-controls="stage" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${p.short ? `<span class="tab-long">${escape(p.label)}</span><span class="tab-short">${escape(p.short)}</span>` : escape(p.label)}</button>`).join(''));
inject(/(<span class="dt-score" id="dt-score"[^>]*>)[\s\S]*?(<\/span><!--\/dt-score-->)/, `<b>${demo.tests.filter(demoPassed).length}</b> of ${demo.tests.length} shown tests passed`);
inject(/(<script type="application\/json" id="demo-data">)[\s\S]*?(<\/script><!--\/demo-data-->)/, JSON.stringify(demo).replace(/</g, '\\u003c'));
pages['index.html'] = pages['index.html'].replace(/(tests AI agents rebuilding )\d+( production-level websites through browser exploration: )[\d,]+( hidden tests, )\w+( models, best score )[\d.]+%/g, `$1${facts.tasks}$2${facts.tests}$3${words[modelIDs.length]}$4${facts['best-overall']}`).replace(/(is a benchmark of )\d+( expert-built website tasks and )[\d,]+( hidden tests)/, `$1${facts.tasks}$2${facts.tests}$3`).replace(/(Results cover )\w+( models)/, `$1${words[modelIDs.length]}$2`);
const faq = faqItems({facts, ranked});
inject(/(<dl class="faq" id="faq-list">)[\s\S]*?(<\/dl><!--\/faq-list-->)/, faq.map(f => `<div><dt>${escape(f.q)}</dt><dd>${faqHtml(f.a, escape)}</dd></div>`).join(''));
const bibtex = fs.readFileSync(path.join(root, 'CITATION.bib'), 'utf8').trim();
const OWNER = {'@id': 'https://website-bench.com/#org'};
inject(/(<script type="application\/ld\+json" id="ld-answers">)[\s\S]*?(<\/script><!--\/ld-answers-->)/, JSON.stringify({'@context': 'https://schema.org', '@graph': [
  {'@type': 'Organization', '@id': 'https://website-bench.com/#org', name: 'WebsiteBench', url: 'https://website-bench.com/', logo: 'https://website-bench.com/assets/brand/logo-512.png', sameAs: ['https://github.com/TIGER-AI-Lab/WebsiteBench', 'https://huggingface.co/datasets/TIGER-Lab/WebsiteBench', 'https://hub.harborframework.com/datasets/websitebench/WebsiteBench']},
  {'@type': 'ScholarlyArticle', '@id': 'https://website-bench.com/#paper', headline: 'WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?', name: 'WebsiteBench: Can AI Agents Rebuild Websites through Browser Exploration?', url: 'https://website-bench.com/', datePublished: '2026', inLanguage: 'en', author: {'@type': 'Organization', name: 'WebsiteBench Authors'}, publisher: OWNER, about: {'@id': 'https://website-bench.com/#dataset'}, isPartOf: {'@id': 'https://website-bench.com/#website'}, abstract: `WebsiteBench is a benchmark of ${facts.tasks} production-level websites that AI agents rebuild through browser exploration, scored by ${facts.tests} hidden tests. The best of ${facts.models} models, ${best.name}, passes ${facts['best-overall']}.`},
  {'@type': 'FAQPage', '@id': 'https://website-bench.com/#faq', mainEntity: faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: plain(f.a)}}))},
]}).replace(/</g, '\\u003c'));
pageFiles.forEach(file => {
  pages[file] = pages[file].replace(/(<[^>]*\bdata-fact="([\w-]+)"[^>]*>)[^<]*(<)/g, (match, open, key, close) => {
    if (!(key in facts)) throw Error('Unknown fact: ' + key);
    return open + escape(facts[key]) + close;
  });
  fs.writeFileSync(path.join(root, file), pages[file]);
});

// The Tasks pages: the sheet in tasks.html and one static page per website in task/.
const ORIGIN = 'https://website-bench.com';
const previews = read('task-previews.json');
const {count, taskPath, cardHtml, runRowsHtml, viewTabsHtml, runSentence, shotAlt, shot} = tasksView;
const taskPages = materials.tasks.map(t => tasksView.buildTask(t, materials.models, previews.tasks[t.id]?.views || [])).sort((a, b) => a.name.localeCompare(b.name, 'en', {sensitivity: 'base'}));
const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c');
const WEBSITE = {'@id': `${ORIGIN}/#website`}, DATASET = {'@id': `${ORIGIN}/#dataset`};

let sheet = fs.readFileSync(path.join(root, 'tasks.html'), 'utf8');
const injectSheet = (marker, value) => { if (!marker.test(sheet)) throw Error('Generated content marker missing: ' + marker); sheet = sheet.replace(marker, (_, start, end) => start + value + end); };
const hardest = taskPages.reduce((a, b) => (b.best.rate < a.best.rate ? b : a)), easiest = taskPages.reduce((a, b) => (b.best.rate > a.best.rate ? b : a));
const taskTests = taskPages.map(t => t.tests);
injectSheet(/(<p class="rail-text" id="catalog-lede">)[\s\S]*?(<\/p>)/, `Best pass rate from ${hardest.best.rate.toFixed(1)}% on ${escape(hardest.name)} to ${easiest.best.rate.toFixed(1)}% on ${escape(easiest.name)}. Select a website to compare its rebuilds.`);
injectSheet(/(<ul class="facts" id="catalog-facts">)[\s\S]*?(<\/ul>)/, `<li><b>${taskPages.length}</b> websites</li><li><b>${count(taskTests.reduce((a, b) => a + b))}</b> hidden tests</li><li><b>${count(Math.min(...taskTests))}</b> tests on the smallest</li><li><b>${count(Math.max(...taskTests))}</b> tests on the largest</li>`);
injectSheet(/(<ul class="task-grid" id="task-grid">)[\s\S]*?(<\/ul><!--\/task-grid-->)/, taskPages.map(cardHtml).join(''));
const sheetTitle = /<title>([^<]*)<\/title>/.exec(sheet)[1], sheetDescription = /<meta name="description" content="([^"]*)">/.exec(sheet)[1];
injectSheet(/(<script type="application\/ld\+json" id="ld">)[\s\S]*?(<\/script>)/, jsonLd({'@context': 'https://schema.org', '@graph': [{'@type': 'CollectionPage', '@id': `${ORIGIN}/tasks#page`, url: `${ORIGIN}/tasks`, name: sheetTitle, description: sheetDescription.replace(/&#39;/g, "'"), inLanguage: 'en', isPartOf: WEBSITE, about: DATASET, mainEntity: {'@type': 'ItemList', numberOfItems: taskPages.length, itemListElement: taskPages.map((t, i) => ({'@type': 'ListItem', position: i + 1, name: t.name, url: `${ORIGIN}${taskPath(t.id)}`}))}}, {'@type': 'BreadcrumbList', itemListElement: [{'@type': 'ListItem', position: 1, name: 'WebsiteBench', item: `${ORIGIN}/`}, {'@type': 'ListItem', position: 2, name: 'Tasks', item: `${ORIGIN}/tasks`}]}]}));
fs.writeFileSync(path.join(root, 'tasks.html'), sheet);

const taskMain = fs.readFileSync(path.join(root, 'tools/task-main.html'), 'utf8');
const NOJS_TASK = '#view-tabs,#compare-modes,.task-picker,.divider,.run-shot{display:none!important}.task-picker-label{background:none!important;padding-right:0!important}';
const firstShot = task => task.runs.find(r => shot(task.views[0], r));
// One share image per website: redrawn only when its screenshots, its model or the template changed.
const ogTemplate = fs.readFileSync(path.join(root, 'tools/task-og.html'));
const ogCards = new Map(taskPages.map(task => {
  const view = task.views[0], run = firstShot(task), slug = taskPath(task.id).slice('/task/'.length);
  const reference = view.reference.image.slice(1), rebuild = shot(view, run).slice(1), model = run.model.name;
  const key = createHash('sha1').update(ogTemplate).update(fs.readFileSync(path.join(root, reference))).update(fs.readFileSync(path.join(root, rebuild))).update(model).digest('hex').slice(0, 8);
  return [task.id, {slug, reference, rebuild, model, key}];
}));
const ogFresh = ({slug, key}) => fs.existsSync(path.join(root, 'assets/og', `${slug}.png`)) && fs.existsSync(path.join(root, 'task', `${slug}.html`)) && fs.readFileSync(path.join(root, 'task', `${slug}.html`), 'utf8').includes(`/assets/og/${slug}.png?v=${key}"`);
const ogStale = [...ogCards.values()].filter(card => !ogFresh(card));
if (ogStale.length) execFileSync(process.execPath, [path.join(root, 'tools/render-task-og.js'), JSON.stringify(ogStale)], {stdio: 'inherit'});
fs.rmSync(path.join(root, 'task'), {recursive: true, force: true});
fs.mkdirSync(path.join(root, 'task'));
const fillHead = (shell, {title, description, url, image, imageAlt}) => shell
  .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(title)}</title>`)
  .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${escape(description)}">`)
  .replace(/<link rel="canonical" href="[^"]*">\n?(<link rel="alternate" type="text\/markdown"[^>]*>)?/, () => `<link rel="canonical" href="${url}">\n<link rel="alternate" type="text/markdown" href="${url}/index.md">`)
  .replace(/<meta property="og:url" content="[^"]*">/, () => `<meta property="og:url" content="${url}">`)
  .replace(/<meta property="og:title" content="[^"]*">/, () => `<meta property="og:title" content="${escape(title)}">`)
  .replace(/<meta property="og:description" content="[^"]*">/, () => `<meta property="og:description" content="${escape(description)}">`)
  .replace(/<meta name="twitter:title" content="[^"]*">/, () => `<meta name="twitter:title" content="${escape(title)}">`)
  .replace(/<meta name="twitter:description" content="[^"]*">/, () => `<meta name="twitter:description" content="${escape(description)}">`)
  .replace(/<meta property="og:image" content="[^"]*">/, () => `<meta property="og:image" content="${image}">`)
  .replace(/<meta name="twitter:image" content="[^"]*">/, () => `<meta name="twitter:image" content="${image}">`)
  .replace(/<meta property="og:image:alt" content="[^"]*">/, () => `<meta property="og:image:alt" content="${escape(imageAlt)}">`)
  .replace(/<meta name="twitter:image:alt" content="[^"]*">/, () => `<meta name="twitter:image:alt" content="${escape(imageAlt)}">`);
const taskSlug = task => taskPath(task.id).slice('/task/'.length);
const taskTitle = task => [`${task.name}: AI agent rebuilds compared · WebsiteBench`, `${task.name}: agent rebuilds · WebsiteBench`, `${task.name} · WebsiteBench`].find(t => t.length <= 60);
const taskAnswer = task => `${task.name} is one of the ${facts.tasks} WebsiteBench tasks: an AI agent explores it in a browser and rebuilds it, scored by ${count(task.tests)} hidden tests. The best rebuild passes ${task.best.rate.toFixed(1)}% of them (${task.best.model.name}).`;
for (const [index, task] of taskPages.entries()) {
  const previous = taskPages[(index - 1 + taskPages.length) % taskPages.length], next = taskPages[(index + 1) % taskPages.length];
  const view = task.views[0], run = firstShot(task), url = `${ORIGIN}${taskPath(task.id)}`, card = ogCards.get(task.id);
  const image = `${ORIGIN}/assets/og/${card.slug}.png?v=${card.key}`, imageAlt = `${task.name}: the reference beside the rebuild by ${run.model.name}`;
  const title = taskTitle(task);
  const description = `${task.name} on WebsiteBench: ${count(task.tests)} hidden tests. Best pass rate ${task.best.rate.toFixed(1)}%, by ${task.best.model.name}. Compare every model’s rebuild with the reference.`;
  const fields = {
    id: escape(task.id), name: escape(task.name), picker: taskPages.map(t => `<option value="${escape(t.id)}"${t === task ? ' selected' : ''}>${escape(t.name)}</option>`).join(''),
    'prev-href': taskPath(previous.id), 'prev-name': escape(previous.name), 'next-href': taskPath(next.id), 'next-name': escape(next.name),
    sentence: escape(runSentence(view, run)), answer: escape(taskAnswer(task)), 'view-tabs': viewTabsHtml(task, view), ratio: `${view.viewport.width} / ${view.viewport.height}`, route: escape(view.route),
    reference: escape(view.reference.image), rebuild: escape(shot(view, run)), width: view.viewport.width, height: view.viewport.height,
    'reference-alt': escape(shotAlt(task, view, null)), 'rebuild-alt': escape(shotAlt(task, view, run)), 'rebuild-label': escape(run.model.name),
    runs: runRowsHtml(task, view, run), data: jsonLd({id: task.id, name: task.name, runs: task.runs, views: task.views, catalog: taskPages.map(t => ({id: t.id, name: t.name, best: t.best.rate, tests: t.tests, views: t.views.map(v => v.id)}))}),
  };
  const main = taskMain.replace(/\{\{([\w-]+)\}\}/g, (_, key) => { if (!(key in fields)) throw Error('Unknown field: ' + key); return fields[key]; });
  const graph = {'@context': 'https://schema.org', '@graph': [{'@type': 'WebPage', '@id': `${url}#page`, url, name: title, description, inLanguage: 'en', isPartOf: WEBSITE, about: DATASET, primaryImageOfPage: {'@type': 'ImageObject', contentUrl: `${ORIGIN}${view.reference.image}`, width: view.viewport.width, height: view.viewport.height}}, {'@type': 'Dataset', '@id': `${url}#dataset`, name: `${task.name} (WebsiteBench task)`, description: taskAnswer(task), url, isPartOf: DATASET, license: 'https://www.apache.org/licenses/LICENSE-2.0', isAccessibleForFree: true, inLanguage: 'en', creator: {'@type': 'Organization', name: 'WebsiteBench Authors'}}, {'@type': 'BreadcrumbList', itemListElement: [{'@type': 'ListItem', position: 1, name: 'WebsiteBench', item: `${ORIGIN}/`}, {'@type': 'ListItem', position: 2, name: 'Tasks', item: `${ORIGIN}/tasks`}, {'@type': 'ListItem', position: 3, name: task.name, item: url}]}]};
  const page = fillHead(sheet, {title, description, url, image, imageAlt})
    .replace(/<script>\(function\(\)\{var q=new URLSearchParams[\s\S]*?<\/script>\n/, '')
    .replace(/<noscript><style>[^<]*<\/style><\/noscript>/, () => `<noscript><style>${NOJS_TASK}</style></noscript>`)
    .replace(/<script type="application\/ld\+json" id="ld">[\s\S]*?<\/script>/, () => `<script type="application/ld+json">${jsonLd(graph)}</script>`)
    .replace('<link rel="stylesheet"', () => `<link rel="preload" as="image" href="${escape(view.reference.image)}" fetchpriority="high">\n<link rel="stylesheet"`)
    .replace(/(<script src="assets\/js\/)tasks\.js(\?v=[^"]*)" defer><\/script>/, '$1tasks-view.js$2" defer></script>\n$1tasks.js$2" defer></script>')
    .replace(/<main id="main"[\s\S]*?<\/main>\n?/, () => main)
    .replace(/((?:href|src)=")(assets|data)\//g, '$1/$2/');
  const file = path.join(root, `${taskPath(task.id).slice(1)}.html`);
  fs.writeFileSync(file, page);
}

// Crawlers: the sitemap follows the pages; its date is the last change to the published data.
let lastmod;
try { lastmod = execFileSync('git', ['-C', root, 'log', '-1', '--format=%cs', '--', 'data'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch (_) { /* not a repository */ }
lastmod = lastmod || new Date().toISOString().slice(0, 10);
const sitemapPaths = ['/', '/run', '/tasks', '/eval', '/analysis', ...taskPages.map(t => taskPath(t.id))];
fs.writeFileSync(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map(p => `  <url><loc>${ORIGIN}${p}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`);


fs.writeFileSync(path.join(root, 'data/evaluated-tasks.json'), JSON.stringify(ids, null, 2) + '\n');
const taskCatalog = {models: materials.models, tasks: materials.tasks.map(t => ({id: t.id, name: t.name, views: previews.tasks[t.id]?.views || []}))};
fs.writeFileSync(path.join(root, 'data/task-catalog.json'), JSON.stringify(taskCatalog, null, 2) + '\n');
const nTwins = agents.build({root, modelWord: words[modelIDs.length][0].toUpperCase() + words[modelIDs.length].slice(1), facts, ranked, taskPages, lastmod, faq, bibtex, demo, best, taskSlug, taskTitle, taskAnswer});
console.log(`Wrote ${nTwins} Markdown twins, llms.txt, llms-full.txt and AGENTS.md.`);
console.log(`Verified and rendered ${ids.length} tasks × ${modelIDs.length} models; ${facts.tests} hidden tests; best ${facts['best-overall']} (${best.name}).`);
