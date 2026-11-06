// Write the leaderboard, inline data, headline numbers and citation into the static pages, so they work without JavaScript.
// Run after any change to data/ or CITATION.bib: node tools/prerender.js
const fs = require('node:fs'), path = require('node:path');
const {renderRows} = require('../assets/js/leaderboard-view.js');
const root = path.join(__dirname, '..'), read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const cohort = read('cohort.json'), waffle = read('waffle.json'), board = read('leaderboard-views.json'), materials = read('task-materials.json');
const ids = cohort.tasks.map(t => t.id), modelIDs = waffle.models.map(m => m.id), same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
if (ids.length !== 70 || new Set(ids).size !== 70 || !same(ids, waffle.tasks.map(t => t.id)) || !same(ids, materials.tasks.map(t => t.id))) throw Error('Current views must share the exact 70-task cohort');
if (modelIDs.length !== 9 || new Set(modelIDs).size !== 9) throw Error('Expected the nine leaderboard models');
for (const view of ['overview', '1m', '200k']) for (const model of board.views[view]) {
  const entries = waffle.tasks.map(t => t.results[model.id].contexts[model.variable_context ? view : 'recorded']).filter(e => e.status === 'scored');
  const passed = entries.reduce((n, e) => n + e.passed, 0), total = entries.reduce((n, e) => n + e.total, 0);
  if (model.coverage.overall !== entries.length || Math.abs(model.overall - 100 * passed / total) > 1e-9 || model.score_counts.overall.passed !== passed || model.score_counts.overall.total !== total) throw Error('Leaderboard and Waffle test counts disagree');
}

// Headline numbers. A task's hidden test count is the total used by most of its scored results.
const caseCount = task => {
  const counts = new Map();
  for (const result of Object.values(task.results)) for (const e of Object.values(result.contexts)) if (e.status === 'scored') counts.set(e.total, (counts.get(e.total) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
};
const tests = waffle.tasks.reduce((n, t) => n + caseCount(t), 0), perTask = waffle.tasks.map(caseCount);
const overview = board.views.overview, best = overview.reduce((a, b) => (b.overall > a.overall ? b : a));
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
  'best-turns': Number.isFinite(best.turns) ? Math.round(best.turns).toLocaleString('en-US') : '—',
  'one-in': words[oneIn] || String(oneIn),
  'demo-threshold': String(demo.threshold),
  'demo-run-passed': demoCount(demo.run.passed),
  'demo-run-total': demoCount(demo.run.total),
  'demo-run-score': (100 * demo.run.passed / demo.run.total).toFixed(1) + '%',
  'demo-run-request': demo.run.groups.request.join('/'),
  'demo-run-browser': demo.run.groups.browser.join('/'),
  'demo-run-system': demo.run.groups.system.join('/'),
  'demo-stored-threshold': String(demo.run.stored_threshold),
  'demo-stored-passed': demoCount(demo.run.passed_at_stored_threshold),
  'demo-shown': String(demo.tests.length),
};

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inject = (marker, value) => { if (!marker.test(html)) throw Error('Generated content marker missing: ' + marker); html = html.replace(marker, (_, start, end) => start + value + end); };
inject(/(<tbody id="board-body">)[\s\S]*?(<\/tbody><!--\/board-body-->)/, '\n' + renderRows(overview) + '\n');
for (const [id, data] of [['waffle-data', waffle], ['leaderboard-data', board]]) inject(new RegExp(`(<script type="application/json" id="${id}">)[\\s\\S]*?(<\\/script><!--\\/${id}-->)`), JSON.stringify(data).replace(/</g, '\\u003c'));
inject(/(<pre[^>]*id="bibtex"[^>]*><code>)[\s\S]*?(<\/code><\/pre>)/, escape(fs.readFileSync(path.join(root, 'CITATION.bib'), 'utf8').trim()));
inject(/(<ul class="chips" id="site-list"[^>]*>)[\s\S]*?(<\/ul><!--\/site-list-->)/, cohort.tasks.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', {sensitivity: 'base'})).map(t => `<li><a href="tasks.html?task=${encodeURIComponent(t.id)}">${escape(t.name)}</a></li>`).join(''));

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
html = html.replace(/(<[^>]*\bdata-fact="([\w-]+)"[^>]*>)[^<]*(<)/g, (match, open, key, close) => {
  if (!(key in facts)) throw Error('Unknown fact: ' + key);
  return open + escape(facts[key]) + close;
});
fs.writeFileSync(path.join(root, 'index.html'), html);

// llms.txt: the leaderboard block and the headline sentence follow the data.
let llms = fs.readFileSync(path.join(root, 'llms.txt'), 'utf8');
const pct = value => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—');
const lines = overview.map(m => `- ${m.name}: ${pct(m.overall)} / ${pct(m.request)} / ${pct(m.browser)} / ${pct(m.system)}`).join('\n');
if (!/## Leaderboard[^\n]*\n[\s\S]*?\n(?=## )/.test(llms)) throw Error('llms.txt leaderboard block missing');
llms = llms.replace(/(## Leaderboard[^\n]*\n)[\s\S]*?\n(?=## )/, `$1${lines}\n\n`);
llms = llms.replace(/It has \d+ tasks with [\d,]+ hidden tests\./, `It has ${facts.tasks} tasks with ${facts.tests} hidden tests.`);
llms = llms.replace(/which passes [\d,]+ of [\d,]+ hidden tests at a similarity threshold of [\d.]+\./, `which passes ${facts['demo-run-passed']} of ${facts['demo-run-total']} hidden tests at a similarity threshold of ${facts['demo-threshold']}.`);
llms = llms.replace(/The best overall score is [\d.]+% \([^)]*\)\./, `The best overall score is ${facts['best-overall']} (${best.name}).`);
fs.writeFileSync(path.join(root, 'llms.txt'), llms);

fs.writeFileSync(path.join(root, 'data/evaluated-tasks.json'), JSON.stringify(ids, null, 2) + '\n');
const previews = read('task-previews.json');
const taskCatalog = {models: materials.models, tasks: materials.tasks.map(t => ({id: t.id, name: t.name, views: previews.tasks[t.id]?.views || []}))};
fs.writeFileSync(path.join(root, 'data/task-catalog.json'), JSON.stringify(taskCatalog, null, 2) + '\n');
console.log(`Verified and rendered ${ids.length} tasks × ${modelIDs.length} models; ${facts.tests} hidden tests; best ${facts['best-overall']} (${best.name}).`);
